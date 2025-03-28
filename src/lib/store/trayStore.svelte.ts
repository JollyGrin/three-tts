import { writable, get } from 'svelte/store';
import type { CardState } from './objectStore.svelte';

type CardsState = Record<string, CardState>;

// Create the writable store
const cards = writable<CardsState>({});

// Add or update a card's state
function updateCardState(
	id: string,
	position: [number, number, number],
	_faceImageUrl?: string,
	_rotation?: [number, number, number]
) {
	cards.update((state) => {
		const rotation = _rotation ?? state[id]?.rotation ?? [0, 0, 0];
		const faceImageUrl = _faceImageUrl ?? state[id]?.faceImageUrl ?? '';
		return {
			...state,
			[id]: { position, rotation, faceImageUrl }
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
	updateCardState,
	removeCard,
	getCardState,
	...cards
};
