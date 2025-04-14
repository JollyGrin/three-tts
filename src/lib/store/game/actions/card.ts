import { get } from 'svelte/store';
import { gameStore } from '../gameStore.svelte';
import { dragStore } from '$lib/store/dragStore.svelte';

function getCardState(cardId: string) {
	return get(gameStore)?.cards?.[cardId];
}

function removeCard(cardId: string) {
	return gameStore.updateState({ cards: { [cardId]: null } });
}

/**
 * Flips a card over
 * If no cardId provided, uses the id of the hovered card
 * */
function flipCard(cardId?: string) {
	const { isHovered, isDragging } = get(dragStore);
	const hoveredId = isHovered || isDragging;
	let id = cardId ?? hoveredId;
	if (!id) return console.error('No cardId provided to flip');

	const card = get(gameStore)?.cards?.[id];
	const [_x = 0, y = 0, z = 0] = card?.rotation ?? [];
	const isFlipped = card?.rotation?.[0] === 180; // 180 = backFace of card is visible
	const x = isFlipped ? 0 : 180;
	return gameStore.updateState({
		cards: { [id as string]: { rotation: [x, y, z] } }
	});
}

function tapCard(isReverse?: boolean, cardId?: string) {
	const { isHovered, isDragging } = get(dragStore);
	const hoveredId = isHovered || isDragging;
	let id = cardId ?? hoveredId;
	if (!id) return console.error('No cardId provided to flip');

	const card = get(gameStore)?.cards?.[id]; // grab card on table
	const [x = 0, y = 0, _z = 0] = card?.rotation ?? []; // get current rotation
	const isClockwise = isReverse ? -1 : 1; // isReverse reverses the rotation
	const z = _z + 90 * isClockwise; // rotate 90 degrees counter/clockwise
	gameStore.updateState({
		cards: { [id as string]: { rotation: [x, y, z] } }
	});
}

export const cardActions = {
	getCardState,
	removeCard,
	flipCard,
	tapCard
};
