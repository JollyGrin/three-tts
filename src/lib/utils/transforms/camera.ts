import { get } from 'svelte/store';
import { seatStore, setSeat } from '$lib/store/seatStore.svelte';

// reset camera view to top down
function resetView() {
	const currentSeat = get(seatStore).seat; // save current seat
	setSeat();
	setSeat(currentSeat); // return index to current seat
}

export const cameraTransforms = {
	resetView
};
