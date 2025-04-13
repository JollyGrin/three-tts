import { writable, get } from 'svelte/store';
import { objectStore, type CardState } from './objectStore.svelte';
import { generateCardImages, getSorceryCardImage } from '$lib/utils/mock/cards';
import { getStaticResourceUrl } from '$lib/utils/image';
import { playerStore } from './playerStore.svelte';
import { purgeUndefinedValues } from '$lib/utils/transforms/data';
import { localStateUpdater, transformPayload } from './transform-helpers';
import { DEG2RAD } from 'three/src/math/MathUtils.js';

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

/**
 * NOTE: when using this internally, ALWAYS use deckStore.updateDeck.
 * This is required for the websocket to properly shadow the function
 * Otherwise, internal functions won't use the replaced function.
 *
 * NOTE: ONLY SEND WHATS NECESSARY
 * Let existing state be used by default if values undefined
 * */
function updateDeck(
	id: string | Partial<DeckDTO>,
	updatedState?: Partial<DeckDTO>
) {
	const payload = transformPayload(id, updatedState);
	return localStateUpdater(payload, decks.update);
}

function initDeck(props: { isFaceUp?: boolean }) {
	const { id, deckIds, seat } = playerStore.getMe() ?? {};
	if (!id || !deckIds) return;
	const newDeckIndex = deckIds.length; // length - 1 = last item, so length = next item
	const deckId = `deck:${id}:${newDeckIndex}`;
	playerStore.addDeckToPlayer(id, deckId);
	const mod = props.isFaceUp ? 2 : 0;
	const positions = [
		[8.5 + mod, 0.4, 4.5],
		[8.5 + mod, 0.4, -4.7]
	];

	const rotations = [
		[0, 0, 0],
		[0, DEG2RAD * 180, 0]
	];
	deckStore.updateDeck(deckId, {
		isFaceUp: props.isFaceUp ?? false,
		position: positions[seat % positions.length] as [number, number, number],
		rotation: rotations[seat % rotations.length] as [number, number, number],
		cards: generateCardImages(2).map((slug, index) => ({
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
	const { cards, isFaceUp } = get(decks)[id];

	const card = isFaceUp ? cards.shift() : cards.pop();
	deckStore.updateDeck(id, { cards });
	return card;
}

function placeOnTopOfDeck(deckId: string, cardId: string) {
	const _card = get(objectStore)[cardId];
	const card: CardInDeck = { id: cardId, faceImageUrl: _card.faceImageUrl };

	const { cards, isFaceUp } = get(decks)[deckId];
	isFaceUp ? cards.unshift(card) : cards.push(card);

	return deckStore.updateDeck(deckId, { cards });
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
	// NOTE: silent updated in storeIntegration.ts
	silentUpdateDeck: (..._args: Parameters<typeof updateDeck>) =>
		console.warn('updateDeck not initialized'),
	getDeckLength,
	drawFromTop,
	placeOnTopOfDeck,
	initDeck
};
