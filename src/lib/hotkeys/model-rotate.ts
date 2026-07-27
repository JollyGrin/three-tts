import { get } from 'svelte/store';
import { gameActions } from '$lib/store/game/actions';
import { hoveredPiece } from '$lib/store/pieceUi';
import { SNAP_GRID_YAW_STEP_DEFAULT } from '$lib/utils/constants-snap';

/**
 * `T`/`R` over a hovered model piece: turn it by the grid's yaw step (90°),
 * mirroring card tap — the only other keyboard rotate in the app. Returns the
 * piece it acted on, or null so the caller can fall through to `tapCard`;
 * shared by /play and /setup for the usual "same verb both surfaces" reason.
 */
export function rotateHoveredModel(direction: 1 | -1): string | null {
	const id = get(hoveredPiece);
	if (!id) return null;
	if (gameActions.getPieceState(id)?.kind !== 'model') return null;
	gameActions.rotatePiece(id, direction * SNAP_GRID_YAW_STEP_DEFAULT);
	return id;
}
