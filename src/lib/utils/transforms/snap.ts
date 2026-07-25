import { DEG2RAD } from 'three/src/math/MathUtils.js';
import type { GameDTO, SnapPointDTO } from '$lib/store/game/types';
import { SNAP_RADIUS_DEFAULT, SNAP_RADIUS_MAX, SNAP_RADIUS_MIN } from '$lib/utils/constants-snap';

/**
 * Snap points: where a drop is *pulled to*, as opposed to where the pointer
 * happened to be.
 *
 * The whole mechanic is this one pure function plus a branch in `resolveDrop`.
 * Nothing about a snap is synced on its own: the dropping client resolves the
 * point, writes the final position through the same move path as any other
 * drop, and the relay carries that — so both clients land on the identical
 * transform without any new machinery.
 */

/** A resolved snap: the exact transform a caught drop commits at. */
export interface SnapResolution {
	/** which snap point caught the drop */
	id: string;
	x: number;
	z: number;
	/** authored yaw in degrees, or undefined to keep the entity's own rotation */
	rotation?: number;
	/** the radius that caught it, after clamping */
	radius: number;
	/** distance from the drop point to the snap point */
	distance: number;
}

/** Authored radius, clamped to something that can actually catch a drop. */
export function snapRadius(point: Partial<SnapPointDTO> | null | undefined): number {
	const raw = point?.radius;
	if (typeof raw !== 'number' || !Number.isFinite(raw)) return SNAP_RADIUS_DEFAULT;
	return Math.min(Math.max(raw, SNAP_RADIUS_MIN), SNAP_RADIUS_MAX);
}

function xz(point: Partial<SnapPointDTO> | null | undefined): [number, number] | null {
	const p = point?.position;
	if (!Array.isArray(p) || p.length < 2) return null;
	const [x, z] = p;
	if (typeof x !== 'number' || typeof z !== 'number') return null;
	if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
	return [x, z];
}

/**
 * The snap point that catches a drop at (x, z), or null if none does.
 *
 * Nearest point wins, so overlapping catch radii resolve to the one the drop
 * is actually closest to. Ties break on id — records arrive in whatever order
 * a merge patch built them, and a snap must not depend on that.
 */
export function resolveSnap(
	snapPoints: GameDTO['snapPoints'] | undefined | null,
	x: number,
	z: number
): SnapResolution | null {
	let best: SnapResolution | null = null;

	for (const [id, point] of Object.entries(snapPoints ?? {})) {
		const position = xz(point);
		if (!position) continue; // null = removed, or a malformed entry
		const radius = snapRadius(point);
		const distance = Math.hypot(position[0] - x, position[1] - z);
		if (distance > radius) continue;
		if (best && (distance > best.distance || (distance === best.distance && id >= best.id))) {
			continue;
		}
		const rotation = typeof point?.rotation === 'number' ? point.rotation : undefined;
		best = { id, x: position[0], z: position[1], rotation, radius, distance };
	}

	return best;
}

/**
 * Which entity is landing. They do not agree on where — or in what unit — a
 * table yaw lives, so a single authored scalar has to be routed per kind.
 */
export type SnapRotationTarget = 'card' | 'piece' | 'deck';

/**
 * Apply an authored snap yaw (degrees) to an entity's rotation triple.
 *
 * The three conventions, none of which this function gets to choose:
 * - **cards** — yaw is `rotation[2]` in **degrees** (what `tapCard` turns;
 *   `Card.svelte` renders it as `rotation.y = -z`), and `rotation[0]` is the
 *   facedown flip, which a snap must never touch.
 * - **pieces** — yaw is the natural `rotation[1]`, in **degrees**. Today
 *   nothing renders it (a token is a disc), but it is part of the piece's
 *   transform and both clients must agree on it.
 * - **decks** — yaw is `rotation[1]` in **radians**: `Deck.svelte` hands the
 *   triple straight to its `<T.Group>`, and the seat-1 default is
 *   `[0, Math.PI, 0]`. So the authored degrees convert here; writing degrees
 *   into a deck would spin it by a factor of 57.
 *
 * Returns the input untouched when the point authored no rotation — an
 * unrotated snap point is a position guide only.
 */
export function applySnapRotation(
	rotation: [number, number, number],
	yaw: number | undefined,
	target: SnapRotationTarget
): [number, number, number] {
	if (yaw === undefined) return rotation;
	const [x, y, z] = rotation;
	switch (target) {
		case 'card':
			return [x, y, yaw];
		case 'piece':
			return [x, yaw, z];
		case 'deck':
			return [x, yaw * DEG2RAD, z];
	}
}
