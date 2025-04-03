import { get } from 'svelte/store';
import { seatStore, setSeat } from '$lib/store/seatStore.svelte';
import { dragStore } from '$lib/store/dragStore.svelte';

// reset camera view to top down
function resetView() {
	const currentSeat = get(seatStore).seat; // save current seat
	setSeat();
	setSeat(currentSeat); // return index to current seat
}

function togglePreviewHud(isPreview?: boolean) {
	const currentPreviewState = get(dragStore).isPreview;
	const targetPreviewState =
		isPreview !== undefined ? isPreview : !currentPreviewState;
	dragStore.update((state) => ({
		...state,
		isPreview: targetPreviewState
	}));
}

export const cameraTransforms = {
	resetView,
	togglePreviewHud
};
