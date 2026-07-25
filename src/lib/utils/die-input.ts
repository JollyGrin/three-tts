import type { IntersectionEvent } from '@threlte/extras';
import { createSingleDispatchGuard } from './single-hit-dispatch';
import { DRAG_THRESHOLD_PX } from './counter-input';

export type DieInputDeps = {
	/** the piece these handlers belong to (a getter: it's a component prop) */
	id: () => string;
	/** tokens, pawns and counters ignore die input entirely */
	isDie: () => boolean;
	/** true once this pointer press travelled far enough to become a drag */
	wasDrag: () => boolean;
	/** gameActions.rollDie, injected so the input logic is testable */
	roll: (id: string) => void;
};

/**
 * Click-to-roll for a die, kept out of Piece.svelte for the same reason
 * `createCounterInput` is: a die is a `<T.Group>` over a mesh and a hover
 * label, and Threlte queues that group once per child the ray pierces, so an
 * unguarded handler would roll twice off one click (tableplace-84). The guard
 * is claimed before the drag-threshold return, or the below-threshold bail-out
 * would leak the event to the duplicate entry.
 *
 * Dice stay draggable, so a press only becomes a roll if the pointer barely
 * moved — the same click-vs-drag discrimination a counter uses, with the lift
 * deferred in Piece.svelte until the pointer actually travels.
 */
export function createDieInput({ id, isDie, wasDrag, roll }: DieInputDeps) {
	const claimDispatch = createSingleDispatchGuard();

	return {
		onclick(e: IntersectionEvent<MouseEvent>) {
			if (!isDie()) return;
			if (!claimDispatch(e)) return;
			if (wasDrag() || e.delta > DRAG_THRESHOLD_PX) return; // was a drag, not a click
			roll(id());
		}
	};
}
