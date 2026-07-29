import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import {
	clearIntentLog,
	intentLog,
	onIntent,
	withIntent,
	withoutIntents,
	type IntentEvent
} from '$lib/store/game/intents';

/**
 * The intent channel (tableplace-169) as seen from the store: a named verb
 * beside every patch, on the local path AND the inbound one, and nothing of it
 * ever landing in game state.
 *
 * The wire half — the piggyback and its coalescing — is covered next door in
 * `websocket/__tests__/intent-wire.test.ts`; here there is no websocket wrapper
 * installed at all, which is itself the assertion that the channel does not
 * depend on one (an offline table still writes a legible log).
 */

const CARD = 'card:std:AS';

/**
 * A fresh pair of identities per test. The replay guard is per-actor and
 * deliberately outlives `clearIntentLog` — forgetting the log must not make the
 * channel accept history it has already seen — so tests take new seats rather
 * than reaching for a reset the app would never call.
 */
let run = 0;
const me = () => `tester-${run}`;
const peer = () => `peer-${run}`;

function remote(intents: IntentEvent[], state: Record<string, unknown> = {}) {
	return { ...state, __intents: intents } as Parameters<typeof gameStore.updateStateSilently>[0];
}

describe('the intent channel', () => {
	beforeEach(() => {
		run++;
		localStorage.clear();
		localStorage.setItem('myPlayerId', me());
		gameStore.set({
			players: {},
			decks: {},
			cards: { [CARD]: { faceImageUrl: 'gen:std52/AS', rotation: [0, 0, 0], position: [0, 0, 0] } }
		});
		clearIntentLog();
	});

	it('names the verb and its arguments when an action patches state', () => {
		gameActions.flipCard(CARD);

		const [intent, ...rest] = intentLog();
		expect(rest).toEqual([]);
		expect(intent?.verb).toBe('flipCard');
		expect(intent?.args).toEqual([CARD]);
		expect(intent?.seat).toBe(me());
	});

	it('says nothing for a verb that only reads', () => {
		gameActions.getCardState(CARD);
		gameActions.getMe();
		gameActions.getDeckLength('deck:none');
		expect(intentLog()).toEqual([]);
	});

	it('numbers an actor monotonically, so nobody has to renumber on arrival', () => {
		gameActions.flipCard(CARD);
		gameActions.tapCard(false, CARD);
		expect(intentLog().map((i) => i.seq)).toEqual([1, 2]);
	});

	it('mints once per action, under the verb the player asked for', () => {
		// a verb built out of other verbs is still one thing the player did —
		// `commitActiveDrag`'s tray/deck landings are exactly this shape
		const putAway = withIntent('putAway', (id: string) => {
			gameActions.flipCard(id);
			gameActions.tapCard(false, id);
		});
		putAway(CARD);

		expect(intentLog().map((i) => i.verb)).toEqual(['putAway']);
	});

	it('summarises an argument too big to be worth putting on the wire', () => {
		gameActions.addPlayer(me());
		clearIntentLog();
		gameActions.addDeck({
			cards: Array.from({ length: 52 }, (_, index) => ({
				id: `card:bulk:${index}`,
				faceImageUrl: 'gen:std52/AS'
			}))
		});

		// the cards are already in the patch — repeating them here would double
		// every deck spawn on the wire
		expect(intentLog()[0]?.verb).toBe('addDeck');
		expect(intentLog()[0]?.args[0]).toMatchObject({ elided: true });
	});

	it('publishes a peer’s intents from the patch they rode in on', () => {
		const seen: IntentEvent[] = [];
		const off = onIntent((intent) => void seen.push(intent));

		gameStore.updateStateSilently(
			remote([{ seq: 1, seat: peer(), verb: 'shuffleDeck', args: ['deck:peer:0'] }], {
				decks: { 'deck:peer:0': { id: 'deck:peer:0', cards: [] } }
			})
		);
		off();

		expect(seen).toEqual([{ seq: 1, seat: peer(), verb: 'shuffleDeck', args: ['deck:peer:0'] }]);
		// the patch still applied — this channel is a readout, never a gate
		expect(get(gameStore).decks?.['deck:peer:0']).toBeTruthy();
	});

	it('never merges the piggybacked intents into game state', () => {
		gameStore.updateStateSilently(
			remote([{ seq: 1, seat: peer(), verb: 'flipCard', args: [CARD] }], {
				cards: { [CARD]: { rotation: [180, 0, 0] } }
			})
		);

		expect(Object.keys(get(gameStore))).not.toContain('__intents');
		expect(get(gameStore).cards?.[CARD]?.rotation).toEqual([180, 0, 0]);
	});

	it('drops a replay — the relay hands a joiner back the last batch it merged', () => {
		const batch = [{ seq: 1, seat: peer(), verb: 'flipCard', args: [CARD] }];
		gameStore.updateStateSilently(remote(batch));
		gameStore.updateStateSilently(remote(batch));
		gameStore.updateStateSilently(remote([{ seq: 2, seat: peer(), verb: 'tapCard', args: [] }]));

		expect(intentLog().map((i) => [i.seat, i.seq])).toEqual([
			[peer(), 1],
			[peer(), 2]
		]);
	});

	it('ignores anything in the carrier that is not an intent', () => {
		gameStore.updateStateSilently(
			remote([{ nonsense: true } as unknown as IntentEvent, ...([] as IntentEvent[])])
		);
		expect(intentLog()).toEqual([]);
	});

	it('strips the carrier on demand, for the sync snapshot', () => {
		const snapshot = { cards: {}, __intents: [{ seq: 9, seat: peer(), verb: 'x', args: [] }] };
		expect(withoutIntents(snapshot)).toEqual({ cards: {} });
	});
});
