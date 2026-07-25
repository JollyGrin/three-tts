/**
 * claimSeat is the invite-link handoff: every `kind:seat<N>:slug` id in
 * decks/cards/pieces must be rewritten to the claimer's id, the placeholder
 * player removed, and the seat + tray moved onto the claimer. A seat that is
 * already taken must be a strict no-op.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { claimSeat, ensureSeatPlaceholder } from '../scenario';
import type { GameDTO } from '$lib/store/game/types';

const card = {
	position: [0, 0, 0] as [number, number, number],
	rotation: [0, 0, 0] as [number, number, number],
	faceImageUrl: 'face.png'
};

/** A seeded two-seat table where seat 1 is still the placeholder. */
function seedTable() {
	gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
	ensureSeatPlaceholder(1);
	gameStore.updateState({
		players: {
			seat1: { tray: { 'card:seat1:hand-1': card } }
		},
		decks: {
			'deck:seat1:main': { id: 'deck:seat1:main', cards: [{ id: 'c1', faceImageUrl: 'f.png' }] },
			'deck:seat1:discard': { id: 'deck:seat1:discard', cards: [] },
			'deck:host:main': { id: 'deck:host:main', cards: [] }
		},
		cards: {
			'card:seat1:table-1': card,
			'card:host:table-1': card
		},
		pieces: {
			'piece:seat1:hp-0': { id: 'piece:seat1:hp-0', kind: 'counter', value: 20 }
		}
	} as Partial<GameDTO>);
}

describe('claimSeat', () => {
	beforeEach(() => {
		localStorage.clear();
		seedTable();
		localStorage.setItem('myPlayerId', 'joiner');
		gameActions.addPlayer('joiner');
	});

	it('rewrites the placeholder owner across decks, cards, and pieces', () => {
		expect(claimSeat(1)).toBe(true);

		const s = get(gameStore);
		expect(Object.keys(s.decks ?? {}).sort()).toEqual([
			'deck:host:main',
			'deck:joiner:discard',
			'deck:joiner:main'
		]);
		expect(Object.keys(s.cards ?? {}).sort()).toEqual(['card:host:table-1', 'card:joiner:table-1']);
		expect(Object.keys(s.pieces ?? {})).toEqual(['piece:joiner:hp-0']);
		// deck payloads follow their new id
		expect(s.decks?.['deck:joiner:main']).toMatchObject({
			id: 'deck:joiner:main',
			cards: [{ id: 'c1' }]
		});
	});

	it('moves the seat index and tray onto the claimer and removes the placeholder', () => {
		expect(claimSeat(1)).toBe(true);

		const s = get(gameStore);
		expect(s.players?.seat1).toBeUndefined();
		expect(s.players?.joiner?.seat).toBe(1);
		expect(Object.keys(s.players?.joiner?.tray ?? {})).toEqual(['card:seat1:hand-1']);
	});

	it('is a no-op when the seat is already taken', () => {
		expect(claimSeat(1)).toBe(true);
		const afterFirstClaim = get(gameStore);

		// a second player following the same stale invite
		localStorage.setItem('myPlayerId', 'latecomer');
		gameActions.addPlayer('latecomer');
		const beforeSecondClaim = get(gameStore);

		expect(claimSeat(1)).toBe(false);
		const s = get(gameStore);
		expect(s.decks).toEqual(beforeSecondClaim.decks);
		expect(s.cards).toEqual(beforeSecondClaim.cards);
		expect(s.pieces).toEqual(beforeSecondClaim.pieces);
		expect(s.players?.joiner?.seat).toBe(1);
		expect(s.players?.latecomer?.seat).toBe(0);
		expect(afterFirstClaim.decks).toEqual(s.decks);
	});

	it('fails without a local player id', () => {
		localStorage.removeItem('myPlayerId');
		expect(claimSeat(1)).toBe(false);
		expect(get(gameStore).players?.seat1).toBeDefined();
	});
});
