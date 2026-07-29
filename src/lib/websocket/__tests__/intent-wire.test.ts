import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The wire half of the intent channel (tableplace-169).
 *
 * Two properties matter here and nowhere else:
 *
 *  - the verb rides the patch it caused, inside `value`, so the relay's 7 msg/s
 *    budget is spent once and the Go relay (which carries `value` as an opaque
 *    json.RawMessage) needs no change at all;
 *  - the 200ms position throttle COALESCES patches, and coalescing must
 *    concatenate the intents rather than overwrite them — otherwise a burst of
 *    drops loses verbs the acting client already published locally, and the two
 *    clients' streams stop matching, which is the one thing this channel exists
 *    to guarantee.
 */

const mockConnection = vi.hoisted(() => {
	const delivered: Sent[] = [];
	return {
		delivered,
		sendMessage: vi.fn((message: Sent) => {
			delivered.push(message);
			return true;
		})
	};
});

vi.mock('../connection', () => ({ sendMessage: mockConnection.sendMessage }));

import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { clearIntentLog, intentLog, type IntentEvent } from '$lib/store/game/intents';
import { initWrappers } from '../storeIntegration';

/** as much of an outgoing message as these assertions look at */
type Sent = {
	playerId: string;
	value: {
		cards?: Record<string, { rotation?: number[] }>;
		pieces?: Record<string, { position?: number[] }>;
		__intents?: IntentEvent[];
	};
};

const CARD = 'card:std:AS';
const PIECE = 'piece:token:0';

/**
 * `initWrappers` monkeypatches `gameStore.updateState` in place and the wrapper
 * closes over the throttle's clock, so each test puts the untouched function
 * back before re-wrapping: otherwise the wrapper wraps the wrapper (every patch
 * sent twice) and the previous test's send time decides this one's throttling.
 */
const unwrapped = gameStore.updateState;

/**
 * A fresh seat per test. `seq` counts per actor for the life of the module and
 * is deliberately not resettable — a replay guard that can be cleared is not
 * one — so each test takes a seat of its own and starts from 1.
 */
let run = 0;
const me = () => `tester-${run}`;

/** the intents on a delivered message, or [] when it carried none */
function carried(message: Sent | undefined): IntentEvent[] {
	return message?.value?.__intents ?? [];
}

describe('intents on the wire', () => {
	beforeEach(() => {
		mockConnection.delivered.length = 0;
		vi.clearAllMocks();
		run++;
		localStorage.clear();
		localStorage.setItem('myPlayerId', me());
		gameStore.set({
			players: {},
			decks: {},
			cards: { [CARD]: { faceImageUrl: 'gen:std52/AS', rotation: [0, 0, 0] } },
			pieces: { [PIECE]: { kind: 'token', name: 'Scout', position: [0, 0.16, 0] } }
		});
		clearIntentLog();
		gameStore.updateState = unwrapped;
		initWrappers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('sends the verb alongside the patch, in one message', () => {
		gameActions.flipCard(CARD);

		expect(mockConnection.sendMessage).toHaveBeenCalledTimes(1);
		const [message] = mockConnection.delivered;
		expect(message?.value.cards?.[CARD]?.rotation).toEqual([180, 0, 0]);
		expect(carried(message)).toEqual([{ seq: 1, seat: me(), verb: 'flipCard', args: [CARD] }]);
	});

	it('publishes it locally exactly once, not once per seam it passes', () => {
		gameActions.flipCard(CARD);
		expect(intentLog().map((i) => i.verb)).toEqual(['flipCard']);
	});

	it('leaves a patch with no verb behind it alone — the drag stream', () => {
		// what TableScene writes on every pointer move: no action, no intent, and
		// no empty carrier riding along either
		gameStore.updateState({ pieces: { [PIECE]: { position: [1, 0.16, 1] } } });
		expect(mockConnection.delivered[0]?.value.__intents).toBeUndefined();
		expect(intentLog()).toEqual([]);
	});

	it('concatenates the verbs the position throttle coalesces', () => {
		vi.useFakeTimers();

		gameActions.movePiece(PIECE, [1, 0.16, 1]); // leading send
		vi.advanceTimersByTime(50);
		gameActions.movePiece(PIECE, [2, 0.16, 2]); // queued
		vi.advanceTimersByTime(50);
		gameActions.movePiece(PIECE, [3, 0.16, 3]); // merged into the queue
		vi.advanceTimersByTime(300); // the trailing send fires

		expect(mockConnection.delivered).toHaveLength(2);
		expect(carried(mockConnection.delivered[0]).map((i) => i.seq)).toEqual([1]);
		// both of the coalesced moves, in the order they happened
		expect(carried(mockConnection.delivered[1]).map((i) => i.seq)).toEqual([2, 3]);
		expect(mockConnection.delivered[1]?.value.pieces?.[PIECE]?.position).toEqual([3, 0.16, 3]);
	});

	it('carries a queued verb out on the next immediate patch that flushes it', () => {
		vi.useFakeTimers();

		gameActions.movePiece(PIECE, [1, 0.16, 1]); // leading send
		vi.advanceTimersByTime(20);
		gameActions.movePiece(PIECE, [2, 0.16, 2]); // queued behind the throttle
		gameActions.flipCard(CARD); // non-position: flushes the queue into itself

		expect(mockConnection.delivered).toHaveLength(2);
		expect(carried(mockConnection.delivered[1]).map((i) => i.verb)).toEqual([
			'movePiece',
			'flipCard'
		]);
	});
});
