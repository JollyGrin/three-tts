/**
 * The spread layout is the /create preview's answer to "my layout keeps dying":
 * it is a pure function of the draft, so the respawn that used to wipe a
 * hand-made layout is now visually a no-op. These tests pin that property —
 * same draft ⇒ same positions, an edit moves nothing, an add appends — plus the
 * two geometric constraints the grid has to respect.
 */
import { describe, expect, it } from 'vitest';
import {
	canSpread,
	spreadCardCount,
	spreadExtentZ,
	spreadLayout,
	spreadRefusal,
	SPREAD_COLS,
	SPREAD_MAX_CARDS,
	SPREAD_MAX_Z,
	SPREAD_PITCH_X,
	SPREAD_PITCH_Z
} from '$lib/packs/spread';
import { CARD_REST_Y, CARD_STACK_RADIUS } from '$lib/utils/constants-cards';
import type { PackDeckDef } from '$lib/packs/types';

const deck = (slot: string, count: number, from = 0): PackDeckDef => ({
	slot,
	name: slot,
	back: 'gen:std52/back',
	cards: Array.from({ length: count }, (_, i) => ({
		code: `c${from + i}`,
		name: `card ${from + i}`,
		face: `gen:std52/${from + i}`
	}))
});

const positions = (decks: PackDeckDef[]) =>
	spreadLayout(decks).map((tiles) => tiles.map((tile) => tile.position));

describe('spreadLayout', () => {
	it('is a pure function of the draft — same draft, same positions', () => {
		const draft = [deck('main', 7), deck('discard', 3)];
		// two independent copies, so nothing is shared between the two calls
		expect(positions(draft)).toEqual(positions(structuredClone(draft)));
	});

	it('lays a deck out row-major, wrapping at the column count', () => {
		const [tiles] = spreadLayout([deck('main', SPREAD_COLS + 2)]);

		expect(tiles.map((t) => [t.row, t.col]).slice(0, 2)).toEqual([
			[0, 0],
			[0, 1]
		]);
		expect(tiles[SPREAD_COLS]).toMatchObject({ row: 1, col: 0 });
		// one column pitch across, one row pitch down, all resting on the table
		expect(tiles[1].position[0] - tiles[0].position[0]).toBeCloseTo(SPREAD_PITCH_X);
		expect(tiles[SPREAD_COLS].position[2] - tiles[0].position[2]).toBeCloseTo(SPREAD_PITCH_Z);
		expect(tiles[SPREAD_COLS].position[0]).toBeCloseTo(tiles[0].position[0]);
		expect(tiles.every((t) => t.position[1] === CARD_REST_Y)).toBe(true);
	});

	it('keeps neighbouring tiles clear of the loose-stack radius', () => {
		// tighter than this and collectStackGroup reads the row as one pile:
		// hovering would fan it and a dropped card would snap onto its neighbour
		expect(SPREAD_PITCH_X).toBeGreaterThan(CARD_STACK_RADIUS);
		expect(SPREAD_PITCH_Z).toBeGreaterThan(CARD_STACK_RADIUS);
	});

	it('leaves every other tile in place when a card is edited', () => {
		const before = [deck('main', 5)];
		const after = structuredClone(before);
		after[0].cards[2] = { code: 'renamed', name: 'Renamed', face: 'https://example.test/x.png' };

		expect(positions(after)).toEqual(positions(before));
	});

	it('appends a tile when a card is added, moving nothing before it', () => {
		const before = [deck('main', 5)];
		const after = [deck('main', 6)];

		expect(positions(after)[0].slice(0, 5)).toEqual(positions(before)[0]);
		expect(positions(after)[0]).toHaveLength(6);
	});

	it('closes the gap when a card is removed', () => {
		const before = [deck('main', 5)];
		const after = structuredClone(before);
		after[0].cards.splice(2, 1);
		const [tiles] = spreadLayout(after);

		// the tail slides one slot back, and each tile still shows its own card
		expect(tiles.map((t) => t.position)).toEqual(positions(before)[0].slice(0, 4));
		expect(tiles.map((t) => t.card.code)).toEqual(['c0', 'c1', 'c3', 'c4']);
	});

	it('stacks decks as separate blocks, and gives an empty deck no room', () => {
		const [main, empty, discard] = spreadLayout([
			deck('main', 2),
			deck('empty', 0),
			deck('cut', 2)
		]);

		expect(empty).toEqual([]);
		// same row-major geometry inside each block, but further down the table
		expect(main.map((t) => t.position[0])).toEqual(discard.map((t) => t.position[0]));
		expect(discard[0].position[2]).toBeGreaterThan(main[0].position[2] + SPREAD_PITCH_Z);
	});

	it('refuses to spread past the card cap', () => {
		const under = [deck('a', SPREAD_MAX_CARDS)];
		const over = [deck('a', SPREAD_MAX_CARDS), deck('b', 1, SPREAD_MAX_CARDS)];

		expect(spreadCardCount(over)).toBe(SPREAD_MAX_CARDS + 1);
		expect(canSpread(under)).toBe(true);
		expect(spreadRefusal(under)).toBe(null);
		expect(canSpread(over)).toBe(false);
		expect(spreadRefusal(over)).toBe('too-many');
	});

	it('refuses when many small decks would stack off the felt', () => {
		// 20×3 is only 60 cards — under the cap — but 20 blocks deep
		const many = Array.from({ length: 20 }, (_, i) => deck(`d${i}`, 3));

		expect(spreadCardCount(many)).toBeLessThanOrEqual(SPREAD_MAX_CARDS);
		expect(spreadExtentZ(many)).toBeGreaterThan(SPREAD_MAX_Z);
		expect(spreadRefusal(many)).toBe('too-deep');
	});

	it('keeps a full 52-card deck on the felt', () => {
		expect(spreadRefusal([deck('main', 52)])).toBe(null);
		expect(spreadExtentZ([deck('main', 52)])).toBeLessThanOrEqual(SPREAD_MAX_Z);
	});
});
