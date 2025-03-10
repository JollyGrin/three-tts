import { writable } from 'svelte/store';

export const dragStore = writable({
	isDragging: null,
	isHovered: null
} as {
	isDragging: string | null;
	isHovered: string | null;
});

export function dragStart(id: string) {
	dragStore.set({
		isDragging: id,
		isHovered: id
	});
}

export function dragEnd() {
	dragStore.set({
		isDragging: null,
		isHovered: null
	});
}
