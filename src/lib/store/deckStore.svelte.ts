import { writable, get } from 'svelte/store';
import type { CardState } from './objectStore.svelte';

export type DeckDTO = {
	/**
	 * id format
	 * deck:playername:id
	 * */
	id: string;
	/**
	 * true if the deck is face up (like discard pile)
	 * */
	isFaceUp?: boolean;
	position: [number, number, number];
	rotation: [number, number, number];
	cards: Omit<CardState, 'position' | 'rotation'>[];
};

type DecksState = Record<string, DeckDTO>;

const decks = writable<DecksState>({});

function updateDeck(id: string, updatedState: Partial<DeckDTO>) {
	decks.update((state) => {
		const selectedDeck = state[id];
		return {
			...state,
			[id]: { ...selectedDeck, ...updatedState }
		};
	});
}

/**
 * How many cards are in the deck
 * */
function getDeckLength(id: string) {
	return get(decks)[id].cards.length;
}

export const deckStore = {
	...decks,
	updateDeck,
	getDeckLength
};
