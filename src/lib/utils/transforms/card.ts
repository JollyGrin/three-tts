import { get } from 'svelte/store';
import { dragStore } from '$lib/store/dragStore.svelte';
import { objectStore, updateCardState } from '$lib/store/objectStore.svelte';

export function flipCard() {
	const { isHovered, isDragging } = get(dragStore);
	const id = isHovered || isDragging;
	if (!id) return;

	const object = get(objectStore);
	const card = object[id as string];
	const [_x, y, z] = card.rotation;
	const isFlipped = card.rotation[0] === 180;
	updateCardState(id as string, card.position, card.faceImageUrl, [
		isFlipped ? 0 : 180,
		y,
		z
	]);
}
