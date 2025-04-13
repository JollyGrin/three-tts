import { beforeEach, describe, expect, it } from 'vitest';
import { objectStore } from '../objectStore.svelte';
import type { GameDTO } from '../game/types';
import { gameStore } from '../game/gameStore.svelte';
import { get } from 'svelte/store';

const CARD_ID = 'card:name:index';
const mockCard: GameDTO['cards'][string] = {
	position: [1, 2, 3] as [number, number, number],
	rotation: [0, 0, 0] as [number, number, number],
	faceImageUrl: 'test-image.png'
};

describe('gameStore', () => {
	// Reset the store before each test
	beforeEach(() => {
		// Clear the store by using the subscribe method and resetting to empty object
		gameStore.set({});
	});

	it('should add a new card to the store', () => {
		const id = 'card:name:index';
		const cardState = mockCard;

		gameStore.updateState({ cards: { [id]: cardState } });
		const storeState = get(gameStore);
		expect(storeState?.cards?.[id]).toEqual(cardState);
	});
});

describe('Tray', () => {
	// Reset the store before each test
	beforeEach(() => {
		const initGameState = {
			players: { 'player:me': { tray: {} } },
			cards: { [CARD_ID]: mockCard, 'card:player2:index': mockCard }
		};
		gameStore.set(initGameState);
	});

	it.only('add to tray', () => {
		const card = get(gameStore).cards?.[CARD_ID] as GameDTO['cards'][string];
		const trayRecord = { [CARD_ID as string]: card };
		gameStore.updateState({
			cards: { [CARD_ID]: null }
		});
		gameStore.updateState({
			players: { 'player:me': { tray: { ...trayRecord } } }
		});

		const storeState = get(gameStore);
		expect(storeState?.players?.['player:me']?.tray).toEqual({
			[CARD_ID]: card
		});
		expect(storeState?.cards).toEqual({
			'card:player2:index': mockCard
		});
	});
});
