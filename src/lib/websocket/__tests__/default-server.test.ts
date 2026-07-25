import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression guard for which host a client actually dials (#116).
 *
 * The default lives in a module-level const in `connection.ts`, computed once at
 * import time from `localStorage.serverurl` — so every case here has to reset
 * modules and re-import, not just poke localStorage.
 *
 * It matters because the default is invisible in normal use: a developer always
 * has a `serverurl` set, so a wrong default only shows up as first-time visitors
 * quietly landing on the wrong box. `api.table.place` is being repurposed as the
 * HTTP lobby-provisioning API; the relay answers at `lobby.table.place`.
 */

/** Records the URL `connect()` passes to the WebSocket constructor. */
function stubWebSocket(): { url: () => string | undefined } {
	let seen: string | undefined;
	class FakeSocket {
		onopen: (() => void) | null = null;
		onclose: (() => void) | null = null;
		onerror: (() => void) | null = null;
		onmessage: (() => void) | null = null;
		constructor(url: string) {
			seen = url;
		}
		send() {}
		close() {}
	}
	vi.stubGlobal('WebSocket', FakeSocket);
	return { url: () => seen };
}

/**
 * `connect()` is async but has no await before `new WebSocket(...)`, so the
 * socket exists by the time it returns. Nothing resolves the promise (the stub
 * never fires onopen) — that is fine, we only want the URL. It is deliberately
 * not awaited.
 */
async function dial(serverUrl?: string): Promise<string | undefined> {
	const socket = stubWebSocket();
	const { gameActions } = await import('$lib/store/game/actions');
	gameActions.addPlayer('p1');
	const { connect } = await import('../connection');
	void connect('some-lobby', serverUrl);
	return socket.url();
}

describe('default websocket host', () => {
	beforeEach(() => {
		vi.resetModules();
		localStorage.clear();
		localStorage.setItem('myPlayerId', 'p1');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('dials lobby.table.place when nothing is configured', async () => {
		expect(await dial()).toBe('wss://lobby.table.place/ws?lobby=some-lobby&player=p1');
	});

	it('dials lobby.table.place when Settings wrote an empty string', async () => {
		// connectionStore persists '' before a server is ever chosen — the reason
		// connection.ts uses `||` and not `??`
		localStorage.setItem('serverurl', '');
		expect(await dial()).toBe('wss://lobby.table.place/ws?lobby=some-lobby&player=p1');
	});

	it('lets an explicitly-set serverurl beat the default', async () => {
		localStorage.setItem('serverurl', 'relay.example.com');
		expect(await dial()).toBe('wss://relay.example.com/ws?lobby=some-lobby&player=p1');
	});

	it('lets ?server= beat both the default and a set serverurl', async () => {
		localStorage.setItem('serverurl', 'relay.example.com');
		expect(await dial('wss://other.example.com')).toBe(
			'wss://other.example.com/ws?lobby=some-lobby&player=p1'
		);
	});

	it('keeps localhost on ws://, not wss://', async () => {
		localStorage.setItem('serverurl', 'localhost:8080');
		expect(await dial()).toBe('ws://localhost:8080/ws?lobby=some-lobby&player=p1');
	});

	it('keeps localhost on ws:// when it arrives via ?server=', async () => {
		expect(await dial('http://localhost:8080/')).toBe(
			'ws://localhost:8080/ws?lobby=some-lobby&player=p1'
		);
	});
});
