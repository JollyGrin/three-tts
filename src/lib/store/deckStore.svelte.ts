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
 * Draws from the top of the deck
 * Follows LIFO (Last In First Out)
 * When facedown (like a deck of cards), the top card = cards.length - 1
 * When faceup (like a visible discard pile), the top card = cards[0]
 * */
function drawFromTop(id: string) {
	const { cards, isFaceUp, ...deck } = get(decks)[id];

	const card = isFaceUp ? cards.shift() : cards.pop();
	updateDeck(id, { cards, isFaceUp, ...deck });
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
	getDeckLength,
	drawFromTop
};
