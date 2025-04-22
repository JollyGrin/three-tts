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

function incrementHeight(increment: number, cardId?: string) {
	const { isHovered, isDragging } = get(dragStore);
	const hoveredId = isHovered || isDragging;
	let id = cardId ?? hoveredId;
	if (!id) return console.error('No cardId provided to increment');

	const card = get(gameStore)?.cards?.[id]; // grab card on table
	const [x = 0, y = 0, z = 0] = card?.position ?? []; // get current rotation
	// todo: if y above 0.5, assume y = 0.26
	const ceiling = Math.min(0.5, y);
	const _y = ceiling === 0.5 ? 0.26 : ceiling;
	const mod = Math.max(0.26, _y + increment);
	console.table({
		debug: true,
		y,
		increment,
		min: Math.min(0.5, y)
	});
	gameStore.updateState({
		cards: {
			[id as string]: { position: [x, mod, z] }
		}
	});
}

export const cardActions = {
	getCardState,
	removeCard,
	flipCard,
	tapCard,
	incrementHeight
};
