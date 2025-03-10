import { writable } from 'svelte/store';

export const dragStore = writable({
	isDragging: null,
	isHovered: null
} as {
	isDragging: string | null;
	isHovered: string | null;
});
