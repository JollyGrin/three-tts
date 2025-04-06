import { writable, get } from 'svelte/store';
import type { CardState } from './objectStore.svelte';
import { purgeUndefinedValues } from '$lib/utils/transforms/data';

type CardsState = Record<string, CardState>;

// Create the writable store
const cards = writable<CardsState>({});

// Add or update a card's state
function updateCard(id: string, updatedState: Partial<CardState>) {
	cards.update((state) => {
		const selectedCard = state[id];
		return {
			...state,
			[id]: { ...selectedCard, ...purgeUndefinedValues(updatedState) }
		};
	});
}

// Remove a card
function removeCard(id: string) {
	cards.update((state) => {
		const { [id]: _, ...rest } = state;
		return rest;
	});
}

// Get a card's state
function getCardState(id: string): CardState | undefined {
	return get(cards)[id];
}

export const trayStore = {
	updateCard,
	removeCard,
	getCardState,
	...cards
};
