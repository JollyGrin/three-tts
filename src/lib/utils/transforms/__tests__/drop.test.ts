import { describe, it, expect } from 'vitest';
import { clampToTable, resolveDrop } from '../drop';
import type { GameDTO } from '$lib/store/game/types';
import {
	CARD_WIDTH,
	CARD_HEIGHT,
	CARD_REST_Y,
	CARD_THICKNESS,
	CARD_DRAG_Y,
	deckHeightForCount
} from '$lib/utils/constants-cards';
import { PIECE_DEFAULT_RADIUS, PIECE_REST_Y } from '$lib/utils/constants-pieces';
import { EDGE_MARGIN, TABLE_HALF_X, TABLE_HALF_Z, TABLE_TOP_Y } from '$lib/utils/constants-table';

const state = (over: Partial<GameDTO> = {}): Partial<GameDTO> => ({
	cards: {},
	decks: {},
	players: {},
	pieces: {},
	...over
});

const card = (x: number, y: number, z: number, rotation: [number, number, number] = [0, 0, 0]) => ({
	position: [x, y, z] as [number, number, number],
	rotation,
	faceImageUrl: 'face.png'
});

describe('clampToTable', () => {
	it('leaves points on the felt alone', () => {
		expect(clampToTable(3, -4)).toEqual([3, -4]);
	});

	it('clamps a margin inside each edge', () => {
		expect(clampToTable(999, 999)).toEqual([
			TABLE_HALF_X - EDGE_MARGIN,
			TABLE_HALF_Z - EDGE_MARGIN
		]);
		expect(clampToTable(-999, -999)).toEqual([
			-TABLE_HALF_X + EDGE_MARGIN,
			-TABLE_HALF_Z + EDGE_MARGIN
		]);
	});
});

describe('resolveDrop', () => {
	it('returns null with nothing being dragged', () => {
		expect(resolveDrop(state(), null, { x: 0, z: 0 })).toBeNull();
	});

	it('returns null for an entity that is not in the state', () => {
		expect(resolveDrop(state(), 'ghost', { x: 0, z: 0 })).toBeNull();
	});

	it('lands a card on the felt at the raycast point', () => {
		const s = state({ cards: { a: card(0, 2, 0) } });
		const drop = resolveDrop(s, 'a', { x: 4, z: -2 });
		expect(drop).toMatchObject({
			kind: 'table',
			position: [4, CARD_REST_Y, -2],
			footprint: { shape: 'rect', w: CARD_WIDTH, h: CARD_HEIGHT }
		});
	});

	it('clamps the landing inside the table edge', () => {
		const s = state({ cards: { a: card(0, 2, 0) } });
		const drop = resolveDrop(s, 'a', { x: 100, z: -100 });
		expect(drop?.position[0]).toBe(TABLE_HALF_X - EDGE_MARGIN);
		expect(drop?.position[2]).toBe(-TABLE_HALF_Z + EDGE_MARGIN);
	});

	it('falls back to the entity position when there is no raycast hit', () => {
		const s = state({ cards: { a: card(6, 2, 3) } });
		expect(resolveDrop(s, 'a', null)?.position).toEqual([6, CARD_REST_Y, 3]);
	});

	it('resolves the stack height and reports kind "stack"', () => {
		const s = state({ cards: { a: card(0, 2, 0), b: card(0.3, CARD_REST_Y, 0.3) } });
		const drop = resolveDrop(s, 'a', { x: 0, z: 0 });
		expect(drop?.kind).toBe('stack');
		expect(drop?.position[1]).toBeCloseTo(CARD_REST_Y + CARD_THICKNESS);
		// the footprint draws at the resolved rest height, on top of the stack
		expect(drop?.footprintY).toBeCloseTo(CARD_REST_Y + CARD_THICKNESS);
	});

	it('squares a stack drop up to the base card XZ, not the pointer', () => {
		const s = state({ cards: { a: card(0, 2, 0), b: card(1, CARD_REST_Y, -2) } });
		const drop = resolveDrop(s, 'a', { x: 1.4, z: -1.6 });
		expect(drop?.kind).toBe('stack');
		expect(drop?.position[0]).toBe(1);
		expect(drop?.position[2]).toBe(-2);
	});

	it('leaves a bare-felt drop exactly where the pointer is', () => {
		const s = state({ cards: { a: card(0, 2, 0), b: card(8, CARD_REST_Y, 8) } });
		const drop = resolveDrop(s, 'a', { x: 1.4, z: -1.6 });
		expect(drop?.kind).toBe('table');
		expect(drop?.position).toEqual([1.4, CARD_REST_Y, -1.6]);
	});

	it('carries the card rotation through so the preview matches the landing', () => {
		const s = state({ cards: { a: card(0, 2, 0, [180, 0, -90]) } });
		expect(resolveDrop(s, 'a', { x: 1, z: 1 })?.rotation).toEqual([180, 0, -90]);
	});

	it('gives a piece a circular footprint at its own radius', () => {
		const s = state({ pieces: { 'piece:1': { position: [0, 1.2, 0], radius: 1.25 } } });
		const drop = resolveDrop(s, 'piece:1', { x: 2, z: 2 });
		expect(drop).toMatchObject({
			kind: 'table',
			position: [2, PIECE_REST_Y, 2],
			footprint: { shape: 'circle', r: 1.25 }
		});
		// a token's origin is half a disc up; its footprint belongs on the felt
		expect(drop?.footprintY).toBe(TABLE_TOP_Y);
	});

	it('defaults a piece without a radius', () => {
		const s = state({ pieces: { 'piece:1': { position: [0, 1.2, 0] } } });
		expect(resolveDrop(s, 'piece:1', { x: 0, z: 0 })?.footprint).toEqual({
			shape: 'circle',
			r: PIECE_DEFAULT_RADIUS
		});
	});

	it('ignores deck and tray hover for pieces — they only ever settle', () => {
		const s = state({ pieces: { 'piece:1': { position: [0, 1.2, 0] } } });
		const drop = resolveDrop(s, 'piece:1', { x: 0, z: 0 }, { tray: true, deckId: 'deck:1' });
		expect(drop?.kind).toBe('table');
	});

	it('reports a deck drop with the hovered deck as the target', () => {
		const s = state({
			cards: { a: card(0, 2, 0) },
			decks: { 'deck:1': { position: [8, 0.4, 4], rotation: [0, 0, 0], cards: [] } }
		});
		const drop = resolveDrop(s, 'a', { x: 0, z: 0 }, { deckId: 'deck:1' });
		expect(drop?.kind).toBe('deck');
		expect(drop?.targetId).toBe('deck:1');
		expect(drop?.position[0]).toBe(8);
		expect(drop?.position[2]).toBe(4);
	});

	it('reports a tray drop, and the tray wins over a deck', () => {
		const s = state({ cards: { a: card(0, 2, 0) }, decks: { 'deck:1': { cards: [] } } });
		expect(resolveDrop(s, 'a', { x: 0, z: 0 }, { tray: true, deckId: 'deck:1' })?.kind).toBe(
			'tray'
		);
	});

	it('refuses a tray drop on a route with no hand, landing the card on the table', () => {
		// the pack editor: the tray isn't mounted, and a hover flag can arrive
		// stale from a previous /play visit
		const s = state({ cards: { a: card(0, 2, 0) } });
		const drop = resolveDrop(s, 'a', { x: 3, z: -1 }, { tray: true }, { hand: false });
		expect(drop?.kind).toBe('table');
		expect(drop?.position).toEqual([3, CARD_REST_Y, -1]);
	});

	it('still lets a deck win when there is no hand', () => {
		const s = state({
			cards: { a: card(0, 2, 0) },
			decks: { 'deck:1': { position: [8, 0.4, 4], cards: [] } }
		});
		const hover = { tray: true, deckId: 'deck:1' };
		expect(resolveDrop(s, 'a', { x: 0, z: 0 }, hover, { hand: false })?.kind).toBe('deck');
	});

	it('is unfazed by an empty state', () => {
		expect(resolveDrop(undefined, 'a', { x: 0, z: 0 })).toBeNull();
	});

	describe('noSnap (Alt held at release)', () => {
		const overlapping = () =>
			state({ cards: { a: card(0, 2, 0), resting: card(0.2, CARD_REST_Y, 0.2) } });

		it('commits at the raw point instead of squaring up to the pile', () => {
			const drop = resolveDrop(overlapping(), 'a', { x: 0.5, z: 0.4 }, {}, { noSnap: true });
			expect(drop).toMatchObject({ kind: 'table', position: [0.5, CARD_REST_Y, 0.4] });
		});

		it('rests on the felt rather than on top of the card it overlaps', () => {
			const snapped = resolveDrop(overlapping(), 'a', { x: 0.5, z: 0.4 });
			expect(snapped?.kind).toBe('stack');
			expect(snapped?.position[1]).toBe(CARD_REST_Y + CARD_THICKNESS);
			expect(
				resolveDrop(overlapping(), 'a', { x: 0.5, z: 0.4 }, {}, { noSnap: true })?.position[1]
			).toBe(CARD_REST_Y);
		});

		it('still clamps to the felt', () => {
			const drop = resolveDrop(overlapping(), 'a', { x: 999, z: 0 }, {}, { noSnap: true });
			expect(drop?.position[0]).toBe(TABLE_HALF_X - EDGE_MARGIN);
		});

		it('leaves the aimed-at targets alone: deck and tray still win', () => {
			const s = state({ cards: { a: card(0, 2, 0) }, decks: { 'deck:1': { cards: [] } } });
			expect(resolveDrop(s, 'a', { x: 0, z: 0 }, { tray: true }, { noSnap: true })?.kind).toBe(
				'tray'
			);
			expect(
				resolveDrop(s, 'a', { x: 0, z: 0 }, { deckId: 'deck:1' }, { noSnap: true })?.kind
			).toBe('deck');
		});

		it('changes nothing when the modifier is not held', () => {
			expect(resolveDrop(overlapping(), 'a', { x: 0.5, z: 0.4 }, {}, { noSnap: false })).toEqual(
				resolveDrop(overlapping(), 'a', { x: 0.5, z: 0.4 })
			);
		});
	});

	describe('authored snap points', () => {
		const withSnap = (over: Partial<GameDTO> = {}) =>
			state({
				snapPoints: {
					'snap:0': { id: 'snap:0', position: [4, 2], radius: 1, rotation: 90 },
					'snap:1': { id: 'snap:1', position: [-4, 2], radius: 1 }
				},
				...over
			});

		it('pulls a card exactly onto the point and applies its yaw', () => {
			const s = withSnap({ cards: { a: card(0, 2, 0) } });
			const drop = resolveDrop(s, 'a', { x: 4.4, z: 2.3 });
			expect(drop).toMatchObject({
				kind: 'snap',
				position: [4, CARD_REST_Y, 2],
				rotation: [0, 0, 90],
				snap: { id: 'snap:0', radius: 1 }
			});
		});

		it('leaves the facing alone for a point with no authored rotation', () => {
			const s = withSnap({ cards: { a: card(0, 2, 0, [180, 0, 45]) } });
			const drop = resolveDrop(s, 'a', { x: -4, z: 2 });
			expect(drop?.kind).toBe('snap');
			expect(drop?.rotation).toEqual([180, 0, 45]);
		});

		/**
		 * A whole dragged deck (tableplace-88) has to snap as well, and it is the
		 * case the two features had to be composed for: the deck branch resolves
		 * before the card path, so it has to consult the snap itself rather than
		 * returning at the raw pointer.
		 */
		describe('a dragged deck', () => {
			const deck = (n: number, rotation: [number, number, number] = [0, 0, 0]) => ({
				id: 'deck:me:main',
				position: [0, CARD_DRAG_Y, 0] as [number, number, number],
				rotation,
				cards: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, faceImageUrl: 'f.png' }))
			});
			const restY = (n: number) => TABLE_TOP_Y + deckHeightForCount(n) / 2;

			it('lands exactly on the point, keeping its own half-height', () => {
				const s = withSnap({ decks: { 'deck:me:main': deck(20) } });
				const drop = resolveDrop(s, 'deck:me:main', { x: 4.5, z: 2.2 });
				expect(drop).toMatchObject({
					kind: 'snap',
					position: [4, restY(20), 2],
					snap: { id: 'snap:0', radius: 1 }
				});
			});

			it('takes the authored yaw in RADIANS, unlike a card', () => {
				const s = withSnap({ decks: { 'deck:me:main': deck(20) } });
				// snap:0 authors 90°, and a deck's rotation triple is radians
				const [rx, ry, rz] = resolveDrop(s, 'deck:me:main', { x: 4, z: 2 })!.rotation;
				expect([rx, rz]).toEqual([0, 0]);
				expect(ry).toBeCloseTo(Math.PI / 2);
			});

			it('keeps its facing when the point authored no rotation', () => {
				const s = withSnap({ decks: { 'deck:me:main': deck(20, [0, Math.PI, 0]) } });
				const drop = resolveDrop(s, 'deck:me:main', { x: -4, z: 2 });
				expect(drop?.kind).toBe('snap');
				expect(drop?.rotation).toEqual([0, Math.PI, 0]);
			});

			it('still settles at the pointer when no point is in range', () => {
				const s = withSnap({ decks: { 'deck:me:main': deck(8) } });
				const drop = resolveDrop(s, 'deck:me:main', { x: 9, z: -3 });
				expect(drop).toMatchObject({ kind: 'table', position: [9, restY(8), -3] });
				expect(drop?.snap).toBeUndefined();
			});

			it('is opted out of by Alt, like every other snap', () => {
				const s = withSnap({ decks: { 'deck:me:main': deck(8) } });
				const drop = resolveDrop(s, 'deck:me:main', { x: 4.2, z: 2 }, {}, { noSnap: true });
				expect(drop).toMatchObject({ kind: 'table', position: [4.2, restY(8), 2] });
			});

			it('is unaffected by a hovered deck or tray — a pile only ever settles', () => {
				const s = withSnap({ decks: { 'deck:me:main': deck(8) } });
				const hovered = resolveDrop(
					s,
					'deck:me:main',
					{ x: 4, z: 2 },
					{
						tray: true,
						deckId: 'deck:other:main'
					}
				);
				expect(hovered?.kind).toBe('snap');
				expect([hovered?.position[0], hovered?.position[2]]).toEqual([4, 2]);
			});
		});

		it('pulls a piece onto the point too, at piece rest height', () => {
			const s = withSnap({
				pieces: { 'piece:me:t': { position: [0, 1.2, 0], rotation: [0, 0, 0], kind: 'token' } }
			});
			const drop = resolveDrop(s, 'piece:me:t', { x: 3.6, z: 2 });
			expect(drop).toMatchObject({
				kind: 'snap',
				position: [4, PIECE_REST_Y, 2],
				// a piece keeps its table yaw in y, not z (see applySnapRotation)
				rotation: [0, 90, 0],
				footprint: { shape: 'circle', r: PIECE_DEFAULT_RADIUS }
			});
		});

		it('does nothing to a drop outside every radius', () => {
			const s = withSnap({ cards: { a: card(0, 2, 0) } });
			const drop = resolveDrop(s, 'a', { x: 6, z: 2 });
			expect(drop).toMatchObject({ kind: 'table', position: [6, CARD_REST_Y, 2] });
			expect(drop?.snap).toBeUndefined();
		});

		it('stacks on a card already sitting on the point instead of clipping into it', () => {
			const s = withSnap({
				cards: { a: card(0, 2, 0), resting: card(4, CARD_REST_Y, 2) }
			});
			const drop = resolveDrop(s, 'a', { x: 4.3, z: 2 });
			expect(drop).toMatchObject({
				kind: 'snap',
				position: [4, CARD_REST_Y + CARD_THICKNESS, 2]
			});
		});

		it('beats a loose pile that the drop also overlaps', () => {
			// a card resting just off the point: without snapping the drop would
			// square up to it, with snapping the authored spot wins the XZ
			const s = withSnap({
				cards: { a: card(0, 2, 0), loose: card(4.6, CARD_REST_Y, 2.4) }
			});
			const drop = resolveDrop(s, 'a', { x: 4.4, z: 2.2 });
			expect(drop?.kind).toBe('snap');
			expect([drop?.position[0], drop?.position[2]]).toEqual([4, 2]);
		});

		it('loses to the aimed-at targets: tray and deck still win', () => {
			const s = withSnap({ cards: { a: card(0, 2, 0) }, decks: { 'deck:1': { cards: [] } } });
			expect(resolveDrop(s, 'a', { x: 4, z: 2 }, { tray: true })?.kind).toBe('tray');
			expect(resolveDrop(s, 'a', { x: 4, z: 2 }, { deckId: 'deck:1' })?.kind).toBe('deck');
		});

		it('is opted out of by Alt, for both cards and pieces', () => {
			const s = withSnap({
				cards: { a: card(0, 2, 0) },
				pieces: { 'piece:me:t': { position: [0, 1.2, 0], rotation: [0, 0, 0], kind: 'token' } }
			});
			expect(resolveDrop(s, 'a', { x: 4.2, z: 2 }, {}, { noSnap: true })).toMatchObject({
				kind: 'table',
				position: [4.2, CARD_REST_Y, 2]
			});
			expect(resolveDrop(s, 'piece:me:t', { x: 4.2, z: 2 }, {}, { noSnap: true })).toMatchObject({
				kind: 'table',
				position: [4.2, PIECE_REST_Y, 2]
			});
		});

		it('changes nothing for a table that has no snap points', () => {
			const s = state({ cards: { a: card(0, 2, 0) } });
			expect(resolveDrop(s, 'a', { x: 4.4, z: 2.3 })).toEqual(
				resolveDrop(state({ cards: { a: card(0, 2, 0) }, snapPoints: {} }), 'a', {
					x: 4.4,
					z: 2.3
				})
			);
		});
	});
});
