import { DEG2RAD } from 'three/src/math/MathUtils.js';
import { gameActions } from '.';
import { gameStore } from '../gameStore.svelte';
import { generateCardImages, getSorceryCardImage } from '$lib/utils/mock/cards';
import { getStaticResourceUrl } from '$lib/utils/image';
import { get } from 'svelte/store';
import type { GameDTO } from '../types';

function getMyDecks() {
	const myPlayerId = gameActions.getMe()?.id;
	const decks = get(gameStore)?.decks ?? {};
	return Object.entries(decks).filter(([key]) =>
		key.startsWith(`deck:${myPlayerId}:`)
	);
}

function initDeck(props: { isFaceUp?: boolean }) {
	const { id, seat = 0 } = gameActions.getMe() ?? {};
	if (!id) return console.error('Cannot init deck without a playerId');
	const myDecks = getMyDecks();
	const deckId = `deck:${id}:${myDecks.length}`; // will choose next available deckId
	const mod = props.isFaceUp ? 2 : 0;
	const positions = [
		[8.5 + mod, 0.4, 4.5],
		[8.5 + mod, 0.4, -4.7]
	];

	const rotations = [
		[0, 0, 0],
		[0, DEG2RAD * 180, 0]
	];
	gameStore.updateState({
		decks: {
			[deckId]: {
				id: deckId,
				isFaceUp: props.isFaceUp ?? false,
				position: positions[seat % positions.length] as [
					number,
					number,
					number
				],
				rotation: rotations[seat % rotations.length] as [
					number,
					number,
					number
				],
				cards: generateCardImages(2).map((slug, index) => ({
					id: `card:playername:${slug}-${index}`,
					faceImageUrl: getSorceryCardImage(slug),
					backImageUrl: getStaticResourceUrl('/s-back.jpg')
				}))
			}
		}
	});
}

function addDeck(
	props: GameDTO['decks']['string'] & {
		deckId?: string;
		position?: [number, number, number];
		rotation?: [number, number, number];
	}
) {
	const { id, seat = 0 } = gameActions.getMe() ?? {};
	if (!id) return console.error('Cannot init deck without a playerId');
	const myDecks = getMyDecks();
	const deckId = props?.deckId ?? `deck:${id}:${myDecks.length}`; // will choose next available deckId
	const mod = props.isFaceUp ? 2 : 0;
	const positions = [
		[8.5 + mod, 0.4, 4.5],
		[8.5 + mod, 0.4, -4.7]
	];

	const rotations = [
		[0, 0, 0],
		[0, DEG2RAD * 180, 0]
	];
	gameStore.updateState({
		decks: {
			[deckId]: {
				id: deckId,
				isFaceUp: props.isFaceUp ?? false,
				deckBackImageUrl: props.deckBackImageUrl,
				position:
					props?.position ??
					(positions[seat % positions.length] as [number, number, number]),
				rotation:
					props.rotation ??
					(rotations[seat % rotations.length] as [number, number, number]),
				cards: props.cards
			}
		}
	});
}

/**
 * Draws from the top of the deck
 * Follows LIFO (Last In First Out)
 * When facedown (like a deck of cards), the top card = cards.length - 1
 * When faceup (like a visible discard pile), the top card = cards[0]
 *
 * returns the card drawn.
 * */
function drawFromTop(id: string) {
	const { cards, isFaceUp } = get(gameStore)?.decks?.[id] ?? {};
	if (!cards || cards.length === 0)
		return console.error('Cannot draw from an empty deck');

	const card = isFaceUp ? cards.shift() : cards.pop();
	gameStore.updateState({
		decks: { [id]: { cards } }
	});
	return card; // returns card to hoist into cards for dragging
}

type Card = NonNullable<GameDTO['decks'][string]['cards']>[number];
function placeOnTopOfDeck(deckId: string, cardId: string) {
	const _card = get(gameStore)?.cards?.[cardId]; // grab card from table
	if (!_card) return console.error('Card not found');

	const { position, rotation, ...card } = { ..._card, id: cardId };
	card.id = cardId;
	if (!card.faceImageUrl) return console.error('No card faceImageUrl found');

	// get current deck
	const { cards, isFaceUp } = get(gameStore)?.decks?.[deckId] ?? {};
	if (!cards) return console.error('No cards found in deck');

	isFaceUp ? cards.unshift(card as Card) : cards.push(card as Card);
	return gameStore.updateState({
		cards: { [cardId]: null },
		decks: { [deckId]: { cards } }
	});
}

/**
 * How many cards are in the deck
 * */
function getDeckLength(id: string) {
	return get(gameStore)?.decks?.[id]?.cards?.length ?? 0;
}

export const deckActions = {
	drawFromTop,
	getDeckLength,
	initDeck,
	addDeck,
	placeOnTopOfDeck,
	getMyDecks
};
