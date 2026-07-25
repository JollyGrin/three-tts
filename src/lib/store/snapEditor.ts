import { writable } from 'svelte/store';

/**
 * The one bit of transient UI state the snap-point layer needs: whether the
 * next click on bare felt places a point.
 *
 * It lives in a store rather than in `SetupPane` because the click is caught by
 * the table mesh, which sits inside the `<Canvas>` several components away —
 * the same reason `tableFeatures` exists. Kept out of `tableFeatures` on
 * purpose: that store describes what a *route* mounted, this is a tool the
 * author toggles mid-session, and only /setup ever sets it.
 */
export interface SnapEditorState {
	/** armed: a click on the felt adds a snap point there */
	placing: boolean;
	/** yaw in degrees stamped on points placed by clicking; undefined = none */
	rotation?: number;
	/** catch radius stamped on points placed by clicking */
	radius?: number;
}

export const snapEditor = writable<SnapEditorState>({ placing: false });

export function setSnapPlacing(placing: boolean) {
	snapEditor.update((state) => ({ ...state, placing }));
}

/** Defaults the next click-placed point is stamped with. */
export function setSnapDefaults(defaults: { rotation?: number; radius?: number }) {
	snapEditor.update((state) => ({ ...state, ...defaults }));
}
