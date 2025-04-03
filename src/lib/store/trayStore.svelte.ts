import { writable, get } from 'svelte/store';
import type { CardState } from './objectStore.svelte';
import { playerId } from '../websocket';

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
	const currentPlayerId = get(playerId);
	const now = Date.now();
	
	cards.update((state) => {
		const currentCard = state[id];
		const rotation = _rotation ?? currentCard?.rotation ?? [0, 0, 0];
		const faceImageUrl = _faceImageUrl ?? currentCard?.faceImageUrl ?? '';
		
		return {
			...state,
			[id]: { 
				position, 
				rotation, 
				faceImageUrl,
				// Add ownership info to prevent feedback loops
				lastTouchedBy: currentPlayerId,
				lastTouchTime: now 
			}
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
