import { writable, get } from 'svelte/store';
import { objectStore, type CardState } from './objectStore.svelte';
import { generateCardImages, getSorceryCardImage } from '$lib/utils/mock/cards';
import { getStaticResourceUrl } from '$lib/utils/image';
import { playerStore } from './playerStore.svelte';

type CardInDeck = Omit<CardState, 'position' | 'rotation'> & { id: string };

export type DeckDTO = {
	/**
	 * id format
	 * deck:playername:id
	 * */
	id: string;
	deckBackImageUrl?: string;
	/**
	 * true if the deck is face up (like discard pile)
	 * */
	isFaceUp?: boolean;
	position: [number, number, number];
	rotation: [number, number, number];
	/**
	 * Cards in deck are an array instead of record
	 * */
	cards: CardInDeck[];
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

function initDeck(props: { isFaceUp?: boolean }) {
	const { id, deckIds } = playerStore.getMe() ?? {};
	if (!id || !deckIds) return;
	const newDeckIndex = deckIds.length; // length - 1 = last item, so length = next item
	const deckId = `deck:${id}:${newDeckIndex}`;
	playerStore.addDeckToPlayer(id, deckId);
	deckStore.updateDeck(deckId, {
		isFaceUp: props.isFaceUp ?? false,
		position: [8, 0.4, 3],
		cards: generateCardImages(30).map((slug, index) => ({
			id: `card:playername:${slug}-${index}`,
			faceImageUrl: getSorceryCardImage(slug),
			backImageUrl: getStaticResourceUrl('/s-back.jpg')
		}))
	});
}

/**
 * Draws from the top of the deck
 * Follows LIFO (Last In First Out)
 * When facedown (like a deck of cards), the top card = cards.length - 1
 * When faceup (like a visible discard pile), the top card = cards[0]
 *
 * returns the card drawn. Recommended to store it in objectStore (table) or trayStore (hand) after receiving
 * */
function drawFromTop(id: string) {
	const { cards, isFaceUp, ...deck } = get(decks)[id];

	const card = isFaceUp ? cards.shift() : cards.pop();
	updateDeck(id, { cards, isFaceUp, ...deck });
	return card;
}

function placeOnTopOfDeck(deckId: string, cardId: string) {
	const _card = get(objectStore)[cardId];
	const card: CardInDeck = { id: cardId, faceImageUrl: _card.faceImageUrl };

	const { cards, isFaceUp, ...deck } = get(decks)[deckId];
	isFaceUp ? cards.unshift(card) : cards.push(card);

	return updateDeck(deckId, { cards, isFaceUp, ...deck });
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
	drawFromTop,
	placeOnTopOfDeck,
	initDeck
};
