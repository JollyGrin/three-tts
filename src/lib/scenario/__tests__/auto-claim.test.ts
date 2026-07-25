/**
 * startAutoClaim must survive the real join sequence: the scenario syncs in
 * some time after connecting, the local player id may not exist yet, and a
 * stale invite's seat may already be gone. It retries until claimSeat truly
 * succeeds and always reports a give-up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { startAutoClaim, type AutoClaimFailureReason } from '../autoClaim';
import { ensureSeatPlaceholder, type SeatIndex } from '../scenario';
import type { GameDTO } from '$lib/store/game/types';

/** flush pending microtasks (queueMicrotask-scheduled claim attempts) */
const flush = () => Promise.resolve().then(() => Promise.resolve());

function seedSeat(seat: SeatIndex) {
	ensureSeatPlaceholder(seat);
	gameStore.updateState({
		decks: {
			[`deck:seat${seat}:main`]: {
				id: `deck:seat${seat}:main`,
				cards: [{ id: 'c1', faceImageUrl: 'f.png' }]
			}
		}
	} as Partial<GameDTO>);
}

describe('startAutoClaim', () => {
	let stop: () => void = () => {};
	const claimed: SeatIndex[] = [];
	const failures: { seat: SeatIndex; reason: AutoClaimFailureReason }[] = [];
	const handlers = {
		onClaimed: (seat: SeatIndex) => claimed.push(seat),
		onFailed: (seat: SeatIndex, reason: AutoClaimFailureReason) => failures.push({ seat, reason })
	};

	beforeEach(() => {
		vi.useFakeTimers();
		localStorage.clear();
		claimed.length = 0;
		failures.length = 0;
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
	});

	afterEach(() => {
		stop();
		vi.useRealTimers();
	});

	it('ignores missing or invalid seat params', async () => {
		startAutoClaim(null, handlers)();
		startAutoClaim('7', handlers)();
		startAutoClaim('nope', handlers)();
		await flush();
		vi.advanceTimersByTime(30000);
		expect(claimed).toEqual([]);
		expect(failures).toEqual([]);
	});

	it('claims once the scenario placeholder arrives', async () => {
		localStorage.setItem('myPlayerId', 'joiner');
		gameActions.addPlayer('joiner');
		stop = startAutoClaim('1', handlers);
		await flush();
		expect(claimed).toEqual([]); // nothing to claim yet

		seedSeat(1);
		await flush();

		expect(claimed).toEqual([1]);
		expect(get(gameStore).players?.joiner?.seat).toBe(1);
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:joiner:main']);
	});

	it('retries until the claim actually succeeds instead of latching on the first attempt', async () => {
		// the placeholder is already synced, but my player id does not exist yet
		// — the first claim attempt fails and must NOT end the watch
		seedSeat(0);
		stop = startAutoClaim('0', handlers);
		await flush();
		expect(claimed).toEqual([]);

		// websocket init finishes: player id lands, store changes, retry succeeds
		localStorage.setItem('myPlayerId', 'joiner');
		gameActions.addPlayer('joiner');
		await flush();

		expect(claimed).toEqual([0]);
		expect(get(gameStore).players?.joiner?.seat).toBe(0);
	});

	it('retries on the poll interval even without further store changes', async () => {
		seedSeat(0);
		stop = startAutoClaim('0', handlers);
		await flush();
		expect(claimed).toEqual([]);

		// the id appears without any store update to re-trigger the subscription
		localStorage.setItem('myPlayerId', 'joiner');
		await vi.advanceTimersByTimeAsync(600);

		expect(claimed).toEqual([0]);
	});

	it('reports seat-taken when someone else beat the invite to the seat', async () => {
		// host claimed seat 1 before this invite was opened: no placeholder,
		// the seat occupied by a player who owns decks
		localStorage.setItem('myPlayerId', 'joiner');
		gameActions.addPlayer('joiner');
		gameStore.updateState({
			players: { rival: { id: 'rival', seat: 1, joinTimestamp: 1, tray: {}, metadata: {} } },
			decks: { 'deck:rival:main': { id: 'deck:rival:main', cards: [] } }
		} as Partial<GameDTO>);

		stop = startAutoClaim('1', handlers);
		await vi.advanceTimersByTimeAsync(20000);

		expect(claimed).toEqual([]);
		expect(failures).toEqual([{ seat: 1, reason: 'seat-taken' }]);
		// the joiner stays unseated — nothing was claimed or renamed
		expect(get(gameStore).players?.joiner?.seat).toBe(0);
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:rival:main']);
	});

	it('reports timed-out when no scenario ever arrives', async () => {
		localStorage.setItem('myPlayerId', 'joiner');
		gameActions.addPlayer('joiner');

		stop = startAutoClaim('2', handlers);
		await vi.advanceTimersByTimeAsync(20000);

		expect(claimed).toEqual([]);
		expect(failures).toEqual([{ seat: 2, reason: 'timed-out' }]);
	});

	it('does not fire handlers after being stopped', async () => {
		seedSeat(0);
		stop = startAutoClaim('0', handlers);
		stop();
		await flush();

		localStorage.setItem('myPlayerId', 'joiner');
		gameActions.addPlayer('joiner');
		await vi.advanceTimersByTimeAsync(30000);

		expect(claimed).toEqual([]);
		expect(failures).toEqual([]);
	});
});
