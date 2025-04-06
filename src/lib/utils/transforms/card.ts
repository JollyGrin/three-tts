import { get } from 'svelte/store';
import { dragStore } from '$lib/store/dragStore.svelte';
import { objectStore } from '$lib/store/objectStore.svelte';

function flipCard() {
	const { isHovered, isDragging } = get(dragStore);
	const id = isHovered || isDragging;
	if (!id) return;

	const object = get(objectStore);
	const card = object[id as string];
	const [_x, y, z] = card.rotation;
	const isFlipped = card.rotation[0] === 180;
	objectStore.updateCardState(id as string, card.position, card.faceImageUrl, [
		isFlipped ? 0 : 180,
		y,
		z
	]);
}

function tapCard(isReverse?: boolean) {
	const { isHovered, isDragging } = get(dragStore);
	const id = isHovered || isDragging;
	if (!id) return;

	const object = get(objectStore);
	const card = object[id as string];
	const [x, y, _z] = card.rotation;
	objectStore.updateCardState(id as string, card.position, card.faceImageUrl, [
		x,
		y,
		_z + 90 * (isReverse ? -1 : 1)
	]);
}

export const cardTransforms = {
	flip: flipCard,
	tap: tapCard
};
