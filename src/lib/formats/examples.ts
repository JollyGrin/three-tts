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

/** The URL `EXAMPLE_SCENARIO` claims to fetch `EXAMPLE_PACK` from. */
export const EXAMPLE_PACK_URL = 'https://example.com/packs/ember-duel.tbpp.json';

/**
 * A hand-authorable player pack: one deck, one counter, one board overlay.
 * Everything a third party needs to see in order to write their own.
 */
export const EXAMPLE_PACK: PackFile = {
	$schema: 'https://table.place/pack.schema.json',
	tbpp: 1,
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
		{ kind: 'overlay', pack: 'ember-duel', content: '0', scale: 14 }
	],
	// anything not pack-derived: hand-placed props, ad-hoc counters
	state: {
		pieces: {
			'piece:seat0:objective-0': { kind: 'token', name: 'Objective', color: '#eab308' }
		}
	}
};
