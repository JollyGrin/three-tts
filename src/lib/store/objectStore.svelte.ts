import { writable, get } from 'svelte/store';

export interface CardState {
	position: [number, number, number];
	rotation: [number, number, number];
	faceImageUrl: string;
}

type CardsState = Record<string, CardState>;

// Create the writable store
const cards = writable<CardsState>({});

// Add or update a card's state
export function updateCardState(
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
export function removeCard(id: string) {
	cards.update((state) => {
		const { [id]: _, ...rest } = state;
		return rest;
	});
}

// Get a card's state
export function getCardState(id: string): CardState | undefined {
	return get(cards)[id];
}

// Export the store
export const objectStore = {
	subscribe: cards.subscribe,
	update: updateCardState,
	remove: removeCard,
	get: getCardState,
	reset: () => cards.set({})
};
