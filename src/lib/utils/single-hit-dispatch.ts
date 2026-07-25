import type { IntersectionEvent } from '@threlte/extras';

/**
 * Threlte's interactivity() dispatches a pointer event to every intersected
 * object, near → far, not just the closest — unless a handler stops
 * propagation. Worse, it pushes one dispatch entry per (hit, eventObject)
 * pair: `getHits` in @threlte/extras/interactivity/setupInteractivity dedupes
 * the raw hits by *leaf* mesh uuid, then bubbles each surviving hit up through
 * its ancestors, so a group that owns the handler is queued once per child
 * mesh the ray pierced. The dispatch loop only `break`s once a handler calls
 * `stopPropagation()`.
 *
 * Both helpers here exist to collapse that fan-out to a single call.
 */

/**
 * Card and Piece pointerdown handlers call this first so an overlapping pile
 * only ever starts a drag on the topmost hit, matching what the hover
 * highlight shows.
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

/**
 * One guard per interactive entity, for the events that aren't pointerdown
 * (click, contextmenu, wheel) where the entity is a group with several
 * raycastable children — a counter is a `<T.Group>` over a disc mesh, an
 * optional image circle and a Billboard'd troika `<Text>` whose raycast covers
 * the whole text block. A ray through the number *and* the disc queues that
 * group twice, so an unguarded handler moved the value by 2 (tableplace-84).
 *
 * Claiming does two things:
 *  - `stopPropagation()` breaks Threlte's dispatch loop, so the duplicate
 *    entries — and any farther piece in a pile — never see this event;
 *  - the native-event identity check refuses a second call for the same host
 *    event, which still holds if the loop somehow continues (another handler's
 *    ordering, a nested interactive child) or the entity grows more children.
 *
 * Call it *before* any early return: a below-threshold click that bailed out
 * without stopping propagation would still leak to the duplicate entry.
 */
export function createSingleDispatchGuard() {
	let lastHandled: Event | null = null;

	return function claimDispatch<E extends Event>(e: IntersectionEvent<E>): boolean {
		e.stopPropagation();
		if (e.nativeEvent === lastHandled) return false;
		lastHandled = e.nativeEvent;
		return true;
	};
}
