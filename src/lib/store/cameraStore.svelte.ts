import { writable } from 'svelte/store';

/** Incremented to request a camera reset; TableCamera reacts to changes. */
export const cameraResetSignal = writable(0);

export function requestCameraReset() {
	cameraResetSignal.update((n) => n + 1);
}

/**
 * Incremented to ask TableCamera to push its current pose onto the ephemeral
 * `camera` stream even though it hasn't moved — used when a peer joins, since
 * the server never replays ephemeral messages to a joiner.
 */
export const cameraBroadcastSignal = writable(0);

export function requestCameraBroadcast() {
	cameraBroadcastSignal.update((n) => n + 1);
}
