import { writable } from 'svelte/store';

/** Incremented to request a camera reset; TableCamera reacts to changes. */
export const cameraResetSignal = writable(0);

export function requestCameraReset() {
	cameraResetSignal.update((n) => n + 1);
}
