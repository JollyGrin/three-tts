/**
 * The worked examples published in `static/llms.txt`.
 *
 * They live in source (not in the doc's prose) for one reason: the contract
 * test imports these exact objects, validates them against the generated
 * schemas, and drives them through the real import/spawn path. An example
 * that stopped working would fail CI instead of quietly misleading whoever
 * pasted the doc into an LLM.
 */

import type { PackFile } from '../packs/file';
import type { ScenarioFile } from '../scenario/file';
import { PACK_SPEC_VERSION, SCENARIO_SPEC_VERSION } from './spec-version';

/** The URL `EXAMPLE_SCENARIO` claims to fetch `EXAMPLE_PACK` from. */
export const EXAMPLE_PACK_URL = 'https://example.com/packs/ember-duel.tbpp.json';

/**
 * A hand-authorable player pack: one deck, one counter, one multi-state token,
 * one blind-draw bag, one board overlay. Everything a third party needs to see
 * in order to write their own.
 */
export const EXAMPLE_PACK: PackFile = {
	$schema: 'https://table.place/pack.schema.json',
	tbpp: 1,
	specVersion: PACK_SPEC_VERSION,
	id: 'ember-duel',
	name: 'Ember Duel',
	scope: 'player',
	decks: [
		{
			slot: 'main',
			name: 'Ember Deck',
			back: 'https://example.com/img/ember-back.png',
			isFaceUp: false,
			cards: [
				{ code: 'strike', name: 'Strike', face: 'https://example.com/img/strike.png' },
				{ code: 'guard', name: 'Guard', face: 'https://example.com/img/guard.png' },
				{ code: 'ember', name: 'Ember', face: 'https://example.com/img/ember.png' }
			]
		},
		{
			slot: 'wounds',
			name: 'Wound Pile',
			back: 'https://example.com/img/ember-back.png',
			isFaceUp: true,
			cards: [{ code: 'wound', name: 'Wound', face: 'https://example.com/img/wound.png' }]
		}
	],
	pieces: [
		{
			kind: 'counter',
			name: 'Health',
			color: '#c2410c',
			maxValue: 25,
			// [x, z] on the table plane, authored for seat 0 and mirrored for seat 1
			position: [-6, 4]
		},
		{
			kind: 'token',
			name: 'Brazier',
			// states[0] is the base face, so imageUrl repeats it for consumers
			// that ignore states
			imageUrl: 'https://example.com/img/brazier-lit.png',
			states: [
				{ face: 'https://example.com/img/brazier-lit.png', name: 'Lit' },
				{ face: 'https://example.com/img/brazier-embers.png', name: 'Embers' },
				{ face: 'https://example.com/img/brazier-out.png', name: 'Out' }
			],
			radius: 0.8,
			position: [0, 0]
		},
		{
			kind: 'bag',
			name: 'Ember Bag',
			color: '#7c2d12',
			// a blind-draw pool: contents are hidden, only the remaining count shows
			drawMode: 'random',
			contents: [
				{ kind: 'token', name: 'Ember Token', color: '#f97316' },
				{ kind: 'token', name: 'Ash Token', color: '#57534e' },
				{ kind: 'card', code: 'omen', name: 'Omen', face: 'https://example.com/img/omen.png' }
			],
			position: [-9, 4]
		}
	],
	overlays: [
		{
			imageUrl: 'https://example.com/img/arena.webp',
			// width / height of the image above
			ratio: 1.6,
			scale: 14
		}
	]
};

/**
 * A scenario that arranges content from two packs: the builtin `standard-52`
 * and the pack above, fetched from its URL. Shows a stacked (order-preserving)
 * deck next to a shuffled one — the distinction scenarios exist to express.
 */
export const EXAMPLE_SCENARIO: ScenarioFile = {
	$schema: 'https://table.place/scenario.schema.json',
	tbps: 2,
	specVersion: SCENARIO_SPEC_VERSION,
	name: 'ember-duel-opening',
	createdAt: 1700000000000,
	packs: [
		{ id: 'standard-52', source: 'builtin' },
		{ id: 'ember-duel', source: EXAMPLE_PACK_URL }
	],
	placements: [
		{
			kind: 'deck',
			pack: 'ember-duel',
			content: 'main',
			seat: 0,
			position: [8.5, 0.4, 4.5],
			rotation: [0, 0, 0],
			isFaceUp: false,
			// a rigged opening: these three cards come off the top in this order
			order: ['ember', 'strike', 'guard'],
			shuffleOnLoad: false
		},
		{
			kind: 'deck',
			pack: 'standard-52',
			content: 'main',
			seat: 1,
			position: [8.5, 0.4, -4.7],
			rotation: [0, 3.141592653589793, 0],
			isFaceUp: false,
			// no `order` needed: this one is shuffled on every load
			shuffleOnLoad: true
		},
		{ kind: 'piece', pack: 'ember-duel', content: '0', seat: 0, value: 25 },
		// the brazier starts burnt out: `state` indexes the pack piece's states
		{ kind: 'piece', pack: 'ember-duel', content: '1', seat: 0, state: 2 },
		// a bag is a piece placement like any other (`content` is its index in
		// the pack's pieces); its contents come from the pack, so a scenario
		// never restates — or leaks — them
		{ kind: 'piece', pack: 'ember-duel', content: '2', seat: 0, position: [-9, 0.335, 4] },
		{ kind: 'overlay', pack: 'ember-duel', content: '0', scale: 14 }
	],
	// placement guides: a card or token released within `radius` of one of these
	// lands exactly on it, turned to `rotation` when it has one. Table-space
	// [x, z], not per-seat — they belong to the board.
	snapPoints: [
		{ position: [0, 2.5], rotation: 0, radius: 1 },
		{ position: [0, -2.5], rotation: 180, radius: 1 },
		// no rotation: a position guide that leaves the card facing as it was
		{ position: [-4, 0] }
	],
	// anything not pack-derived: hand-placed props, ad-hoc counters
	state: {
		pieces: {
			'piece:seat0:objective-0': { kind: 'token', name: 'Objective', color: '#eab308' }
		}
	}
};
