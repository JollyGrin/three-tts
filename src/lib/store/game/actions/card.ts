import { get } from 'svelte/store';
import { gameStore } from '../gameStore.svelte';
import { dragStore } from '$lib/store/dragStore.svelte';
import { CARD_REST_Y } from '$lib/utils/constants-cards';
import { FACEDOWN_ROTATION_X } from '../visibility';
import { sendGameAction } from './net';

function getCardState(cardId: string) {
	return get(gameStore)?.cards?.[cardId];
}

function removeCard(cardId: string) {
	return gameStore.updateState({ cards: { [cardId]: null } });
}

/** The card a keyboard action applies to: whatever is hovered or being dragged. */
function targetCardId(cardId?: string) {
	const { isHovered, isDragging } = get(dragStore);
	return cardId ?? isDragging ?? isHovered ?? undefined;
}

/**
 * Flips a card over.
 * If no cardId provided, uses the id of the hovered card.
 *
 * Online this is a request: turning a card face-up is what makes its face
 * public, so only the server can complete it — it is holding the face until
 * then. Offline (the /setup editor) there is nothing to hide, so we flip
 * locally.
 * */
function flipCard(cardId?: string) {
	const id = targetCardId(cardId);
	if (!id) return console.error('No cardId provided to flip');
	if (sendGameAction('flip', { id })) return;

	const card = get(gameStore)?.cards?.[id];
	const [, y = 0, z = 0] = card?.rotation ?? [];
	const isFlipped = card?.rotation?.[0] === FACEDOWN_ROTATION_X; // 180 = backFace of card is visible
	const x = isFlipped ? 0 : FACEDOWN_ROTATION_X;
	return gameStore.updateState({
		cards: {
			[id]: {
				rotation: [x, y, z],
				visibility: isFlipped ? { kind: 'public' } : { kind: 'hidden' }
			}
		}
	});
}

/**
 * Look at a hidden card without turning it over.
 *
 * Deliberately a first-class move rather than a side effect of hovering: the
 * server hands you the face *and* writes you into the card's `seenBy`, so the
 * rest of the table can see that you looked.
 * */
function peekCard(cardId?: string) {
	const id = targetCardId(cardId);
	if (!id) return console.error('No cardId provided to peek');
	if (sendGameAction('peek', { id })) return;

	// offline: nothing is hidden from the only player there is
	const visibility = get(gameStore)?.cards?.[id]?.visibility;
	const seenBy = visibility?.kind === 'hidden' ? (visibility.seenBy ?? []) : [];
	const me = localPlayerId() ?? 'local';
	return gameStore.updateState({
		cards: { [id]: { visibility: { kind: 'hidden', seenBy: [...seenBy, me] } } }
	});
}

/** Turn a hidden card face-up for the whole table. */
function revealCard(cardId?: string) {
	const id = targetCardId(cardId);
	if (!id) return console.error('No cardId provided to reveal');
	if (sendGameAction('reveal', { id })) return;

	const [, y = 0, z = 0] = get(gameStore)?.cards?.[id]?.rotation ?? [];
	return gameStore.updateState({
		cards: { [id]: { rotation: [0, y, z], visibility: { kind: 'public' } } }
	});
}

function localPlayerId() {
	try {
		return localStorage.getItem('myPlayerId');
	} catch {
		return null;
	}
}

/**
 * Claim the hold lease on an object before dragging it. Rejected server-side
 * when somebody else already holds it — which is what stops two players
 * fighting over one card.
 * */
function grabObject(id: string) {
	return sendGameAction('grab', { id });
}

/** Release the lease. The object keeps whatever transform was last streamed. */
function dropObject(id: string) {
	return sendGameAction('drop', { id });
}

function tapCard(isReverse?: boolean, cardId?: string) {
	const id = targetCardId(cardId);
	if (!id) return console.error('No cardId provided to flip');

	const card = get(gameStore)?.cards?.[id]; // grab card on table
	const [x = 0, y = 0, _z = 0] = card?.rotation ?? []; // get current rotation
	const isClockwise = isReverse ? -1 : 1; // isReverse reverses the rotation
	const z = _z + 90 * isClockwise; // rotate 90 degrees counter/clockwise
	gameStore.updateState({
		cards: { [id]: { rotation: [x, y, z] } }
	});
}

function incrementHeight(increment: number, cardId?: string) {
	const id = targetCardId(cardId);
	if (!id) return console.error('No cardId provided to increment');

	const card = get(gameStore)?.cards?.[id]; // grab card on table
	const [x = 0, y = 0, z = 0] = card?.position ?? []; // get current rotation
	// todo: if y above 0.5, assume y = CARD_REST_Y
	const ceiling = Math.min(0.5, y);
	const _y = ceiling === 0.5 ? CARD_REST_Y : ceiling;
	const mod = Math.max(CARD_REST_Y, _y + increment);
	gameStore.updateState({
		cards: {
			[id]: { position: [x, mod, z] }
		}
	});
}

export const cardActions = {
	getCardState,
	removeCard,
	flipCard,
	peekCard,
	revealCard,
	grabObject,
	dropObject,
	tapCard,
	incrementHeight
};
