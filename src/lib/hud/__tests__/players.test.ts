import { describe, expect, it } from 'vitest';
import { derivePlayerRows, summarize, SEAT_ROTATION_DEG } from '../players';
import type { GameDTO } from '$lib/store/game/types';

const card = {
	position: [0, 0, 0] as [number, number, number],
	rotation: [0, 0, 0] as [number, number, number],
	faceImageUrl: 'face.png'
};

const deckCards = (n: number, prefix: string) =>
	Array.from({ length: n }, (_, i) => ({ id: `card:${prefix}-${i}`, faceImageUrl: 'face.png' }));

const state: Partial<GameDTO> = {
	players: {
		alice: { id: 'alice', seat: 0, joinTimestamp: 10, tray: { a1: card, a2: card }, metadata: {} },
		bob: {
			id: 'bob',
			seat: 1,
			joinTimestamp: 20,
			tray: { b1: card, b2: card, b3: card },
			metadata: {}
		},
		seat2: { id: 'seat2', seat: 2, joinTimestamp: 0, tray: {}, metadata: {} },
		seat3: { id: 'seat3', seat: 3, joinTimestamp: 0, tray: {}, metadata: {} }
	},
	decks: {
		'deck:alice:main': { id: 'deck:alice:main', cards: deckCards(34, 'alice') },
		'deck:alice:discard': { id: 'deck:alice:discard', cards: deckCards(6, 'alice-d') },
		'deck:bob:main': { id: 'deck:bob:main', cards: deckCards(50, 'bob') },
		'deck:seat2:main': { id: 'deck:seat2:main', cards: deckCards(3, 'seat2') }
	},
	cards: {
		'card:alice:main-1': card,
		'card:alice:main-2': card,
		'card:bob:main-7': card
	}
};

describe('derivePlayerRows', () => {
	it('returns one row per player sorted by seat then join time', () => {
		const rows = derivePlayerRows(state, 'alice');
		expect(rows.map((r) => r.id)).toEqual(['alice', 'bob', 'seat2', 'seat3']);
		expect(rows.map((r) => r.seat)).toEqual([0, 1, 2, 3]);
	});

	it('sorts same-seat players by joinTimestamp', () => {
		const rows = derivePlayerRows({
			players: {
				late: { id: 'late', seat: 0, joinTimestamp: 99, tray: {}, metadata: {} },
				early: { id: 'early', seat: 0, joinTimestamp: 1, tray: {}, metadata: {} }
			}
		});
		expect(rows.map((r) => r.id)).toEqual(['early', 'late']);
	});

	it('maps each seat to its table rotation', () => {
		const rows = derivePlayerRows(state);
		expect(rows.map((r) => r.rotationDeg)).toEqual([
			SEAT_ROTATION_DEG[0],
			SEAT_ROTATION_DEG[1],
			SEAT_ROTATION_DEG[2],
			SEAT_ROTATION_DEG[3]
		]);
		expect(rows.map((r) => r.rotationDeg)).toEqual([0, 180, 90, 270]);
	});

	it('counts tray entries as hand size', () => {
		const rows = derivePlayerRows(state);
		expect(rows.find((r) => r.id === 'alice')?.handCount).toBe(2);
		expect(rows.find((r) => r.id === 'bob')?.handCount).toBe(3);
		expect(rows.find((r) => r.id === 'seat2')?.handCount).toBe(0);
	});

	it('groups decks by owner from the deck id, sorted by slot', () => {
		const rows = derivePlayerRows(state);
		expect(rows.find((r) => r.id === 'alice')?.decks).toEqual([
			{ slot: 'discard', count: 6 },
			{ slot: 'main', count: 34 }
		]);
		expect(rows.find((r) => r.id === 'bob')?.decks).toEqual([{ slot: 'main', count: 50 }]);
	});

	it('counts a player’s cards on the table', () => {
		const rows = derivePlayerRows(state);
		expect(rows.find((r) => r.id === 'alice')?.tableCount).toBe(2);
		expect(rows.find((r) => r.id === 'bob')?.tableCount).toBe(1);
		expect(rows.find((r) => r.id === 'seat3')?.tableCount).toBe(0);
	});

	it('flags placeholder seats as open and the local player as me', () => {
		const rows = derivePlayerRows(state, 'bob');
		expect(rows.filter((r) => r.isOpenSeat).map((r) => r.id)).toEqual(['seat2', 'seat3']);
		expect(rows.filter((r) => r.isMe).map((r) => r.id)).toEqual(['bob']);
	});

	it('drops a placeholder row once the seat is claimed', () => {
		const claimed: Partial<GameDTO> = {
			...state,
			players: {
				alice: state.players!.alice,
				carol: { id: 'carol', seat: 2, joinTimestamp: 30, tray: { c1: card }, metadata: {} },
				seat3: state.players!.seat3
			},
			decks: { 'deck:carol:main': { id: 'deck:carol:main', cards: deckCards(3, 'carol') } }
		};
		const rows = derivePlayerRows(claimed, 'alice');
		expect(rows.map((r) => r.id)).toEqual(['alice', 'carol', 'seat3']);
		expect(rows.find((r) => r.id === 'carol')?.isOpenSeat).toBe(false);
		expect(rows.find((r) => r.id === 'carol')?.decks).toEqual([{ slot: 'main', count: 3 }]);
	});

	it('never leaks other players’ tray card ids', () => {
		const rows = derivePlayerRows(state, 'alice');
		expect(Object.keys(rows.find((r) => r.id === 'bob') ?? {})).not.toContain('tray');
		expect(JSON.stringify(rows)).not.toContain('b1');
	});

	it('handles empty and missing state', () => {
		expect(derivePlayerRows(undefined)).toEqual([]);
		expect(derivePlayerRows({})).toEqual([]);
		const sparse = derivePlayerRows({ players: { solo: { id: 'solo' } } });
		expect(sparse).toEqual([
			{
				id: 'solo',
				seat: 0,
				rotationDeg: 0,
				joinTimestamp: 0,
				isMe: false,
				isOpenSeat: false,
				handCount: 0,
				decks: [],
				tableCount: 0
			}
		]);
	});
});

describe('summarize', () => {
	it('counts seated players and open seats', () => {
		expect(summarize(derivePlayerRows(state))).toBe('2 players · 2 open');
	});

	it('uses the singular for one player and omits empty open seats', () => {
		const rows = derivePlayerRows({
			players: { solo: { id: 'solo', seat: 0, joinTimestamp: 1, tray: {}, metadata: {} } }
		});
		expect(summarize(rows)).toBe('1 player');
	});
});
