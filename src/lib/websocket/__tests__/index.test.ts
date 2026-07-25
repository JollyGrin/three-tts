import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression guard for the join re-publish: addPlayer() runs before connect(),
 * so its full-row patch is dropped (sendMessage has no queue). initWebsocket
 * must re-publish {id, joinTimestamp} once the socket is open, or peers only
 * ever see seat/tray/connected patches and the HUD ghost-row guard hides the
 * player forever.
 *
 * The connection mock mirrors the real gating: sends are dropped until
 * connect() has run.
 */
const mockConnection = vi.hoisted(() => {
	let socketOpen = false;
	const delivered: any[] = [];
	return {
		delivered,
		reset() {
			socketOpen = false;
			delivered.length = 0;
		},
		connect: vi.fn(async () => {
			socketOpen = true;
			return true;
		}),
		joinLobby: vi.fn(async () => socketOpen),
		sendMessage: vi.fn((msg: any) => {
			// same rule as the real sendMessage: not connected → dropped
			if (!socketOpen) return false;
			delivered.push(msg);
			return true;
		}),
		onMessage: vi.fn()
	};
});

vi.mock('../connection', () => ({
	connect: mockConnection.connect,
	joinLobby: mockConnection.joinLobby,
	sendMessage: mockConnection.sendMessage,
	onMessage: mockConnection.onMessage
}));
vi.mock('svelte-french-toast', () => ({
	default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
}));
vi.mock('$lib/packs/prewarm-state', () => ({ prewarmGameState: vi.fn() }));

import { initWebsocket } from '..';
import { initWrappers } from '../storeIntegration';
import { gameStore } from '$lib/store/game/gameStore.svelte';

describe('initWebsocket join re-publish', () => {
	beforeEach(() => {
		mockConnection.reset();
		vi.clearAllMocks();
		localStorage.clear();
		localStorage.setItem('myPlayerId', 'tester');
		gameStore.set({ players: {}, decks: {}, cards: {} });
		// /play installs the ws wrapper before initWebsocket — same order here,
		// so updateState calls actually reach (the mocked) sendMessage
		initWrappers();
	});

	it('delivers my joinTimestamp to the lobby after the socket opens', async () => {
		const ok = await initWebsocket('test-lobby');
		expect(ok).toBe(true);

		// the addPlayer() patch fired pre-connect and was dropped, so the only
		// way a players patch with joinTimestamp gets delivered is the
		// re-publish after joinLobby succeeds
		const patch = mockConnection.delivered.find((m) => m?.value?.players?.tester);
		expect(patch).toBeTruthy();
		expect(typeof patch.value.players.tester.joinTimestamp).toBe('number');
	});

	it('re-publishes only id + joinTimestamp — never a seat that could clobber a reconnect', async () => {
		await initWebsocket('test-lobby');
		const patch = mockConnection.delivered.find((m) => m?.value?.players?.tester);
		expect(patch.value.players.tester.seat).toBeUndefined();
		expect(patch.value.players.tester.tray).toBeUndefined();
	});
});
