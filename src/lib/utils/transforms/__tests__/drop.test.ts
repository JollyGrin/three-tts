import { describe, it, expect } from 'vitest';
import { clampToTable, resolveDrop } from '../drop';
import type { GameDTO } from '$lib/store/game/types';
import { CARD_WIDTH, CARD_HEIGHT, CARD_REST_Y, CARD_THICKNESS } from '$lib/utils/constants-cards';
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

	it('is unfazed by an empty state', () => {
		expect(resolveDrop(undefined, 'a', { x: 0, z: 0 })).toBeNull();
	});
});
