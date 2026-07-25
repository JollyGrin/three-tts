import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '../game/gameStore.svelte';
import { gameActions } from '../game/actions';
import { dragStore } from '../dragStore.svelte';
import { CARD_REST_Y, CARD_THICKNESS } from '$lib/utils/constants-cards';

const ME = 'seat0';

const card = (x: number, y: number, z: number, faceUp = false) => ({
	position: [x, y, z] as [number, number, number],
	rotation: [faceUp ? 0 : 180, 0, 0] as [number, number, number],
	faceImageUrl: `${x}-${y}.png`,
	backImageUrl: 'back.png'
});

/** three cards dropped roughly on each other, bottom → top */
function pile(faceUp = false) {
	gameStore.set({
		players: { [ME]: { id: ME, seat: 0 } },
		decks: {},
		cards: {
			middle: card(0.1, CARD_REST_Y + CARD_THICKNESS, 0.1, faceUp),
			top: card(0.2, CARD_REST_Y + 2 * CARD_THICKNESS, 0.2, faceUp),
			bottom: card(0, CARD_REST_Y, 0, faceUp),
			elsewhere: card(9, CARD_REST_Y, 9, faceUp)
		}
	});
}

describe('groupStackIntoDeck', () => {
	beforeEach(() => {
		localStorage.setItem('myPlayerId', ME);
		dragStore.set({
			isDragging: null,
			isHovered: null,
			isDeckHovered: null,
			isTrayHovered: false
		});
		pile();
	});

	it('turns the hovered pile into one deck and deletes the loose cards', () => {
		dragStore.update((s) => ({ ...s, isHovered: 'top' }));
		const deckId = gameActions.groupStackIntoDeck();
		const state = get(gameStore);

		expect(deckId).toBe(`deck:${ME}:0`);
		expect(state.decks?.[deckId as string]?.cards).toHaveLength(3);
		// only the pile is consumed — the card across the table is untouched
		expect(Object.keys(state.cards ?? {})).toEqual(['elsewhere']);
	});

	it('keeps the visual top card on top: drawing returns it first', () => {
		const deckId = gameActions.groupStackIntoDeck('middle') as string;
		expect(gameActions.drawFromTop(deckId)?.id).toBe('top');
		expect(gameActions.drawFromTop(deckId)?.id).toBe('middle');
		expect(gameActions.drawFromTop(deckId)?.id).toBe('bottom');
	});

	it('lands the deck at the base card XZ', () => {
		const deckId = gameActions.groupStackIntoDeck('top') as string;
		const [x, , z] = get(gameStore).decks?.[deckId]?.position ?? [];
		expect([x, z]).toEqual([0, 0]);
	});

	it('makes a face-up pile a face-up deck, drawing the top card first', () => {
		pile(true);
		const deckId = gameActions.groupStackIntoDeck('top') as string;
		const deck = get(gameStore).decks?.[deckId];
		expect(deck?.isFaceUp).toBe(true);
		expect(deck?.cards?.[0].id).toBe('top'); // face-up convention: top is first
		expect(gameActions.drawFromTop(deckId)?.id).toBe('top');
	});

	it('groups a lone card into a 1-card deck', () => {
		const deckId = gameActions.groupStackIntoDeck('elsewhere') as string;
		expect(get(gameStore).decks?.[deckId]?.cards).toHaveLength(1);
		expect(get(gameStore).cards?.elsewhere).toBeUndefined();
	});

	it('does nothing while a card is being held', () => {
		dragStore.update((s) => ({ ...s, isDragging: 'top', isHovered: 'top' }));
		expect(gameActions.groupStackIntoDeck()).toBeUndefined();
		expect(get(gameStore).decks).toEqual({});
	});

	it('does nothing when nothing is hovered', () => {
		expect(gameActions.groupStackIntoDeck()).toBeUndefined();
		expect(get(gameStore).decks).toEqual({});
	});

	it('never reuses a live deck id', () => {
		const first = gameActions.groupStackIntoDeck('elsewhere') as string;
		pile();
		gameStore.updateState({ decks: { [first]: { id: first, cards: [] } } });
		const second = gameActions.groupStackIntoDeck('top') as string;
		expect(second).not.toBe(first);
	});
});
