import { DEG2RAD } from 'three/src/math/MathUtils.js';
import { gameActions } from '.';
import { gameStore } from '../gameStore.svelte';
import { get } from 'svelte/store';
import type { GameDTO } from '../types';
import { sendGameAction } from './net';

function getMyDecks() {
	const myPlayerId = gameActions.getMe()?.id;
	const decks = get(gameStore)?.decks ?? {};
	return Object.entries(decks).filter(([key]) =>
		key.startsWith(`deck:${myPlayerId}:`)
	);
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
 * Draws from the top of the deck onto the table.
 *
 * Deck order and deck faces live on the server — a client holds a count, not a
 * card list — so drawing is a request for a specific new card id, which the
 * server materializes (leased to you, facedown unless the pile is face-up).
 * The caller can start dragging that id immediately.
 *
 * Follows LIFO (Last In First Out): when facedown (like a deck of cards) the
 * top card is the last entry; when faceup (like a visible discard pile) it is
 * the first.
 *
 * Returns the id of the card being drawn, or undefined when there is nothing
 * to draw.
 * */
function drawFromTop(
	deckId: string,
	placement: {
		cardId: string;
		position: [number, number, number];
		rotation: [number, number, number];
	}
): string | undefined {
	if (getDeckLength(deckId) === 0) {
		console.error('Cannot draw from an empty deck');
		return undefined;
	}

	const { cardId, position, rotation } = placement;
	if (sendGameAction('draw', { deckId, id: cardId, position, rotation })) {
		return cardId;
	}

	// offline: we are the authority and hold the whole deck
	const { cards, isFaceUp } = get(gameStore)?.decks?.[deckId] ?? {};
	if (!cards || cards.length === 0) {
		console.error('Cannot draw from an empty deck');
		return undefined;
	}
	const drawn = isFaceUp ? cards.shift() : cards.pop();
	if (!drawn) return undefined;
	gameStore.updateState({
		decks: { [deckId]: { cards } },
		cards: {
			[cardId]: {
				faceImageUrl: drawn.faceImageUrl,
				backImageUrl: drawn.backImageUrl,
				position,
				rotation,
				visibility: isFaceUp ? { kind: 'public' } : { kind: 'hidden' }
			}
		}
	});
	return cardId;
}

/** Put a table card back on a deck. The face goes back behind the server. */
function placeOnTopOfDeck(deckId: string, cardId: string) {
	if (sendGameAction('placeOnDeck', { deckId, id: cardId })) {
		return gameStore.updateStateSilently({ cards: { [cardId]: null } });
	}

	const card = get(gameStore)?.cards?.[cardId]; // grab card from table
	if (!card) return console.error('Card not found');
	if (!card.faceImageUrl) return console.error('No card faceImageUrl found');

	// only the identity travels back into the deck — transform and lease are
	// table state, not card state
	const entry = {
		id: cardId,
		faceImageUrl: card.faceImageUrl,
		backImageUrl: card.backImageUrl
	};

	// get current deck
	const { cards, isFaceUp } = get(gameStore)?.decks?.[deckId] ?? {};
	if (!cards) return console.error('No cards found in deck');

	isFaceUp ? cards.unshift(entry as Card) : cards.push(entry as Card);
	return gameStore.updateState({
		cards: { [cardId]: null },
		decks: { [deckId]: { cards } }
	});
}

type Card = NonNullable<GameDTO['decks'][string]['cards']>[number];

/**
 * How many cards are in the deck.
 *
 * `cardCount` is the server's number and covers the cards you cannot see;
 * `cards.length` is the offline/local-authority fallback.
 * */
function getDeckLength(id: string) {
	const deck = get(gameStore)?.decks?.[id];
	return deck?.cardCount ?? deck?.cards?.length ?? 0;
}

function shuffleCards(cards: any[]) {
	if (!cards || cards.length === 0) return console.error('No cards to shuffle');
	for (let i = cards.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[cards[i], cards[j]] = [cards[j], cards[i]];
	}
	return cards;
}

/**
 * Shuffle deck using the Fisher-Yates shuffle. Online the server does it —
 * shuffling a list of counts would be theatre.
 */
export function shuffleDeck(deckId: string) {
	if (sendGameAction('shuffle', { deckId })) return;

	const deck = get(gameStore)?.decks?.[deckId];
	const cards = deck?.cards;
	if (!cards || cards.length === 0) return console.error('No cards to shuffle');
	const shuffledCards = shuffleCards(cards);
	if (!shuffledCards || shuffledCards.length === 0)
		return console.log('Error shuffling');
	return gameStore.updateState({
		decks: { [deckId]: { cards: shuffledCards } }
	});
}

export const deckActions = {
	addDeck,
	drawFromTop,
	getDeckLength,
	getMyDecks,
	placeOnTopOfDeck,
	shuffleDeck,
	shuffleCards
};
