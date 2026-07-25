import type { IntersectionEvent } from '@threlte/extras';

/**
 * Threlte's interactivity() dispatches a pointerdown to every mesh the ray
 * intersects, near → far, not just the closest — unless a handler stops
 * propagation. Card and Piece pointerdown handlers call this first so an
 * overlapping pile only ever starts a drag on the topmost hit, matching
 * what the hover highlight shows.
 *
 * stopPropagation() halts Threlte's own dispatch to farther hits;
 * stopImmediatePropagation() additionally halts the native DOM event so
 * OrbitControls doesn't rotate during the pre-threshold pixels.
 *
 * Returns false for non-primary buttons (right-click is contextmenu, not
 * drag) without claiming the event, so farther hits still see it.
 */
export function claimPointerDown(e: IntersectionEvent<PointerEvent>): boolean {
	if (e.nativeEvent.button !== 0) return false;
	e.stopPropagation();
	e.stopImmediatePropagation();
	return true;
}
