import { get } from 'svelte/store';
import { dragStore } from '$lib/store/dragStore.svelte';
import { gameActions } from '$lib/store/game/actions';

// reset camera view to top down
function resetView() {
	const currentSeat = gameActions?.getMySeat(); // save current seat
	gameActions.setSeat();
	gameActions.setSeat(currentSeat); // return index to current seat
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
