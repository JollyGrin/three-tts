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
	dragHeight: undefined,
	intersectionPoint: undefined
};

const dragStore = writable<DragState>(initialState);

// Start dragging a card
function dragStart(id: string, height: number) {
	dragStore.update((state) => ({
		...state,
		isDragging: id,
		isHovered: id,
		dragHeight: height
	}));
}

// Update intersection point during drag
function updateIntersection(point: Vector3) {
	dragStore.update((state) => {
		// Only update if we're actually dragging
		if (!state.isDragging) return state;
		
		return {
			...state,
			intersectionPoint: point
		};
	});
}

// End dragging and reset state
function dragEnd() {
	dragStore.set(initialState);
}

// Set hover state
function setHover(id: string | null) {
	dragStore.update((state) => ({
		...state,
		// Don't update hover if we're dragging
		isHovered: state.isDragging ? state.isHovered : id
	}));
}

// Create store actions object
const dragActions = {
	subscribe: dragStore.subscribe,
	start: dragStart,
	end: dragEnd,
	hover: setHover,
	updateIntersection,
	reset: () => dragStore.set(initialState)
};

// Export all public API
export {
	dragStore,
	dragStart,
	dragEnd,
	setHover,
	updateIntersection,
	dragActions,
	type DragState
};
