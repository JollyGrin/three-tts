import { get } from 'svelte/store';
import { gameActions } from '$lib/store/game/actions';
import { hoveredPiece } from '$lib/store/pieceUi';

/**
 * `X` on a hovered piece: show its next state (`Shift+X` steps back).
 *
 * Shared by /play and /setup so the verb behaves identically while playing and
 * while authoring. Silent when nothing is hovered or the piece has a single
 * face — a toast on every stray keypress is noise (same rule as `Shift+G`).
 *
 * Returns the piece it acted on, or null.
 */
export function cycleHoveredPieceState(delta = 1): string | null {
	const id = get(hoveredPiece);
	if (!id) return null;
	const piece = gameActions.getPieceState(id);
	if ((piece?.states?.length ?? 0) < 2) return null;
	gameActions.cyclePieceState(id, delta);
	return id;
}
