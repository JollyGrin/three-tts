import { writable, get } from 'svelte/store';
import type { CardState } from './objectStore.svelte';

export type DeckDTO = {
	/**
	 * id format
	 * deck:playername:id
	 * */
	id: string;
	/**
	 * default value = true
	 * isFaceDown = true: deck is hidden, back of card is visible on top
	 * isFaceDown = false: deck is visible, bottom card face is visible (eg: discard pile)
	 * */
	isFaceDown?: boolean;
	cards: Omit<CardState, 'position' | 'rotation'>[];
};

type DecksState = Record<string, DeckDTO>;

const decks = writable<DecksState>({});

export const deckStore = {
	...decks
};
