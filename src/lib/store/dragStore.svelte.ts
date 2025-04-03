import { writable } from 'svelte/store';
import type { Vector3 } from 'three';

interface DragState {
	isDragging: string | null;
	isHovered: string | null;
	isDeckHovered: string | null;
	isTrayHovered: boolean;
	isPreview?: boolean;
	dragHeight?: number;
	intersectionPoint?: Vector3;
}

const initialState: DragState = {
	isDragging: null,
	isHovered: null,
	isDeckHovered: null,
	isTrayHovered: false,
	isPreview: false,
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

function setTrayHover(isTrayHovered: boolean) {
	dragStore.update((state) => ({
		...state,
		isTrayHovered
	}));
}

function setDeckHover(deckId: string | null) {
	dragStore.update((state) => ({
		...state,
		isDeckHovered: deckId
	}));
}

// Create store actions object
const dragActions = {
	subscribe: dragStore.subscribe,
	start: dragStart,
	end: dragEnd,
	hover: setHover,
	trayHover: setTrayHover,
	updateIntersection,
	reset: () => dragStore.set(initialState)
};

// Export all public API
export {
	dragStore,
	dragStart,
	dragEnd,
	setHover,
	setDeckHover,
	setTrayHover,
	updateIntersection,
	dragActions,
	type DragState
};
