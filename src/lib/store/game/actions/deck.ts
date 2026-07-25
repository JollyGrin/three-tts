import { DEG2RAD } from 'three/src/math/MathUtils.js';
import { gameActions } from '.';
import { gameStore } from '../gameStore.svelte';
import { get } from 'svelte/store';
import { dragStore } from '$lib/store/dragStore.svelte';
import { collectStackGroup, orderForDeck } from '$lib/utils/transforms/stacking';
import { CARD_REST_Y, CARD_THICKNESS, deckHeightForCount } from '$lib/utils/constants-cards';
import { TABLE_TOP_Y } from '$lib/utils/constants-table';
import type { GameDTO } from '../types';

function getMyDecks() {
	const myPlayerId = gameActions.getMe()?.id;
	const decks = get(gameStore)?.decks ?? {};
	return Object.entries(decks).filter(([key]) => key.startsWith(`deck:${myPlayerId}:`));
}

type DeckProps = GameDTO['decks']['string'] & {
	deckId?: string;
	position?: [number, number, number];
	rotation?: [number, number, number];
};

/**
 * Shape the deck patch without committing it, so callers that need the deck
 * and other changes in ONE state patch (grouping a pile deletes the loose
 * cards in the same breath) don't have to broadcast two.
 */
function buildDeck(props: DeckProps) {
	const { id, seat = 0 } = gameActions.getMe() ?? {};
	if (!id) {
		console.error('Cannot init deck without a playerId');
		return null;
	}
	const myDecks = getMyDecks();
	// next free index, not just the count — deleted decks would otherwise let a
	// new deck land on a live id and clobber it
	const taken = new Set(myDecks.map(([key]) => key));
	let next = myDecks.length;
	while (taken.has(`deck:${id}:${next}`)) next++;
	const deckId = props?.deckId ?? `deck:${id}:${next}`;
	const mod = props.isFaceUp ? 2 : 0;
	const positions = [
		[8.5 + mod, 0.4, 4.5],
		[8.5 + mod, 0.4, -4.7]
	];

	const rotations = [
		[0, 0, 0],
		[0, DEG2RAD * 180, 0]
	];
	return {
		deckId,
		deck: {
			id: deckId,
			isFaceUp: props.isFaceUp ?? false,
			deckBackImageUrl: props.deckBackImageUrl,
			position: props?.position ?? (positions[seat % positions.length] as [number, number, number]),
			rotation: props.rotation ?? (rotations[seat % rotations.length] as [number, number, number]),
			cards: props.cards
		}
	};
}

function addDeck(props: DeckProps) {
	const built = buildDeck(props);
	if (!built) return;
	gameStore.updateState({ decks: { [built.deckId]: built.deck } });
	return built.deckId;
}

/**
 * Turn the loose stack under a card into a real deck (hotkey `G`).
 *
 * Membership and ordering come from `collectStackGroup`; the pile lands as a
 * deck at its base card's XZ and the loose card entities are deleted in the
 * same patch, so remote clients never see the pile twice. A one-card "stack"
 * is a legal group — a 1-card deck is a perfectly good pile to build on.
 */
function groupStackIntoDeck(cardId?: string) {
	const { isHovered, isDragging } = get(dragStore);
	if (!cardId && isDragging) return; // don't swallow the card you're holding
	const anchorId = cardId ?? isHovered;
	if (!anchorId) return console.error('No cardId provided to group');

	const cards = get(gameStore)?.cards;
	const group = collectStackGroup(cards, anchorId);
	if (!group) return console.error('No stack found to group');

	// the top card decides the pile's facing: a face-up top becomes a face-up
	// deck (discard-pile style), which also flips the ordering convention —
	// face-up decks draw from the front, facedown ones from the back
	const top = cards?.[group.topId];
	const isFaceUp = (top?.rotation?.[0] ?? 0) !== 180;
	const ordered = orderForDeck(group.ids, isFaceUp);
	const deckCards = ordered.map((memberId) => {
		const card = cards?.[memberId];
		return {
			id: memberId,
			faceImageUrl: card?.faceImageUrl ?? '',
			backImageUrl: card?.backImageUrl
		};
	});

	const [baseX, , baseZ] = group.position;
	const built = buildDeck({
		isFaceUp,
		deckBackImageUrl: top?.backImageUrl,
		// the deck body is centred on its origin, so lift it half its height
		position: [baseX, TABLE_TOP_Y + deckHeightForCount(deckCards.length) / 2, baseZ],
		// card rotation is degrees with z as the yaw Card.svelte applies as -z;
		// deck rotation is radians on the group
		rotation: [0, -(top?.rotation?.[2] ?? 0) * DEG2RAD, 0],
		cards: deckCards as GameDTO['decks']['string']['cards']
	});
	if (!built) return;

	const removals: Record<string, null> = {};
	for (const memberId of group.ids) removals[memberId] = null;
	gameStore.updateState({
		decks: { [built.deckId]: built.deck },
		cards: removals
	});
	return built.deckId;
}

/**
 * Cards a single `Shift+G` will spread. A 200-card deck ungrouped would
 * carpet the felt with cards nobody asked for and no cheap way back, so past
 * this the ungroup refuses and says so (see `hotkeys/ungroup.ts`).
 */
export const UNGROUP_MAX_CARDS = 40;

export type UngroupResult =
	| { ok: true; deckId: string; cardIds: string[] }
	| { ok: false; reason: 'no-deck' | 'not-mine' | 'empty' | 'too-many'; count?: number };

/**
 * Reuse the card's own id when nothing on the table holds it — a deck built
 * by `G` still carries the ids its loose cards had, so a round trip lands the
 * same entities — and fall back to a suffixed id when it's taken (the same
 * pack slot spawned twice, or a copy already drawn out).
 */
function allocateCardId(preferred: string, fallback: string, taken: Set<string>) {
	const base = preferred || fallback;
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

/**
 * Spread a deck back into loose cards (hotkey `Shift+G` on a hovered deck) —
 * the exact inverse of `groupStackIntoDeck`.
 *
 * The cards land at the deck's XZ, one `CARD_THICKNESS` apart in Y with the
 * deck's top card on top, and the deck is deleted in the SAME patch as the
 * cards are created, so remote clients never see both at once. Ownership
 * matches shuffle: only your own decks.
 */
function ungroupDeck(deckId?: string): UngroupResult {
	const id = deckId ?? get(dragStore).isDeckHovered;
	if (!id) return { ok: false, reason: 'no-deck' };

	const deck = get(gameStore)?.decks?.[id];
	if (!deck) return { ok: false, reason: 'no-deck' };
	if (!getMyDecks().some(([key]) => key === id)) return { ok: false, reason: 'not-mine' };

	const deckCards = deck.cards ?? [];
	if (deckCards.length === 0) return { ok: false, reason: 'empty' };
	if (deckCards.length > UNGROUP_MAX_CARDS)
		return { ok: false, reason: 'too-many', count: deckCards.length };

	const isFaceUp = deck.isFaceUp ?? false;
	// orderForDeck is its own inverse: fed the deck's array it hands back the
	// bottom→top order the loose stack had before `G` swallowed it
	const bottomToTop = orderForDeck(deckCards, isFaceUp);

	const [x = 0, , z = 0] = deck.position ?? [];
	// deck rotation is radians of yaw on the group; card rotation is degrees
	// with z as the yaw Card.svelte applies as -z. Rounded so repeated
	// group/ungroup round trips can't drift the tap angle.
	const yaw = Math.round((-(deck.rotation?.[1] ?? 0) / DEG2RAD) * 1e6) / 1e6;

	const taken = new Set(Object.keys(get(gameStore)?.cards ?? {}));
	const cards: Record<string, GameDTO['cards'][string]> = {};
	const cardIds: string[] = [];

	bottomToTop.forEach((card, index) => {
		const cardId = allocateCardId(card.id, `${id}:card-${index}`, taken);
		taken.add(cardId);
		cardIds.push(cardId);
		cards[cardId] = {
			faceImageUrl: card.faceImageUrl ?? '',
			...(card.backImageUrl || deck.deckBackImageUrl
				? { backImageUrl: card.backImageUrl ?? (deck.deckBackImageUrl as string) }
				: {}),
			position: [x, CARD_REST_Y + index * CARD_THICKNESS, z],
			// a face-up deck spreads to face-up cards; 180 on x is facedown
			rotation: [isFaceUp ? 0 : 180, 0, yaw]
		};
	});

	gameStore.updateState({ decks: { [id]: null }, cards });
	return { ok: true, deckId: id, cardIds };
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
	if (!cards || cards.length === 0) return console.error('Cannot draw from an empty deck');

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

function shuffleCards(cards: any[]) {
	if (!cards || cards.length === 0) return console.error('No cards to shuffle');
	for (let i = cards.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[cards[i], cards[j]] = [cards[j], cards[i]];
	}
	return cards;
}

//   /**
//    * Shuffle deck using the Fisher-Yates shuffle
//    */
export function shuffleDeck(deckId: string) {
	const deck = get(gameStore)?.decks?.[deckId];
	const cards = deck?.cards;
	if (!cards || cards.length === 0) return console.error('No cards to shuffle');
	const shuffledCards = shuffleCards(cards);
	if (!shuffledCards || shuffledCards.length === 0) return console.log('Error shuffling');
	return gameStore.updateState({
		decks: { [deckId]: { cards: shuffledCards } }
	});
}

export const deckActions = {
	addDeck,
	groupStackIntoDeck,
	ungroupDeck,
	drawFromTop,
	getDeckLength,
	getMyDecks,
	placeOnTopOfDeck,
	shuffleDeck,
	shuffleCards
};
