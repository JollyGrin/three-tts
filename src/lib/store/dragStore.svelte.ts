import { writable } from 'svelte/store';
import type { Vector3 } from 'three';

interface DragState {
	isDragging: string | null;
	isHovered: string | null;
	dragHeight?: number;
	intersectionPoint?: Vector3;
}

const initialState: DragState = {
	isDragging: null,
	isHovered: null,
	dragHeight: undefined
};

export const dragStore = writable<DragState>(initialState);

// Start dragging a card
export function dragStart(id: string, height: number) {
	dragStore.update((e) => ({
		...e,
		isDragging: id,
		isHovered: id,
		dragHeight: height
	}));
}

// End dragging
export function dragEnd() {
	dragStore.set(initialState);
}

// Set hover state
export function setHover(id: string | null) {
	dragStore.update((state) => ({
		...state,
		isHovered: id
	}));
}

// Export store actions
export const dragActions = {
	subscribe: dragStore.subscribe,
	start: dragStart,
	end: dragEnd,
	hover: setHover,
	reset: () => dragStore.set(initialState)
};
