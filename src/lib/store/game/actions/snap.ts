import { get } from 'svelte/store';
import { gameStore } from '../gameStore.svelte';
import { SNAP_RADIUS_DEFAULT } from '$lib/utils/constants-snap';
import { clampToTable } from '$lib/utils/transforms/drop';
import type { GameDTO, SnapPointDTO } from '../types';

/**
 * Authoring snap points — the /setup layer's whole vocabulary: add, move,
 * retune, remove.
 *
 * Everything goes through `updateState`, so the editor's edits are ordinary
 * surgical patches (and `null` deletes) exactly like a piece's. Snap points are
 * table-scoped, so ids carry no owner: they are plain sequential `snap:<n>`.
 */

type SnapPointState = NonNullable<NonNullable<GameDTO['snapPoints']>[string]>;

export function snapPointIds(state?: Partial<GameDTO> | null): string[] {
	const points = (state ?? get(gameStore))?.snapPoints ?? {};
	return Object.keys(points)
		.filter((id) => points[id])
		.sort(compareSnapIds);
}

/** `snap:2` before `snap:10` — the pane lists them in creation order. */
export function compareSnapIds(a: string, b: string): number {
	const na = Number(a.split(':')[1]);
	const nb = Number(b.split(':')[1]);
	if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Next free `snap:<n>`, one past the highest currently on the table. Deleting
 * the newest point frees its id again, which is fine: /setup is a local editor
 * and the delete has already been applied before the next add is built.
 */
function nextSnapId(): string {
	const used = Object.keys(get(gameStore)?.snapPoints ?? {})
		.map((id) => Number(id.split(':')[1]))
		.filter((n) => Number.isFinite(n));
	return `snap:${used.length ? Math.max(...used) + 1 : 0}`;
}

export type AddSnapPointOptions = {
	/** table-space [x, z]; clamped inside the felt like any other placement */
	position?: [number, number];
	/** yaw in degrees a caught drop turns to */
	rotation?: number;
	radius?: number;
};

/** Place a snap point. Returns its id. */
function addSnapPoint(opts: AddSnapPointOptions = {}): string {
	const id = nextSnapId();
	const [x, z] = clampToTable(opts.position?.[0] ?? 0, opts.position?.[1] ?? 0);
	const point: Partial<SnapPointState> = {
		id,
		position: [x, z],
		radius: opts.radius ?? SNAP_RADIUS_DEFAULT
	};
	if (opts.rotation !== undefined) point.rotation = opts.rotation;
	gameStore.updateState({ snapPoints: { [id]: point } });
	return id;
}

function moveSnapPoint(id: string, position: [number, number]) {
	const [x, z] = clampToTable(position[0], position[1]);
	gameStore.updateState({ snapPoints: { [id]: { position: [x, z] } } });
}

/**
 * Retune a point in place. A `rotation` of `undefined` is how the editor says
 * "no authored yaw" — `null` at that path is what deletes the field, since an
 * undefined value would be dropped from the patch and change nothing.
 */
function updateSnapPoint(id: string, patch: Partial<Omit<SnapPointDTO, 'id'>>) {
	const next: Record<string, unknown> = { ...patch };
	if ('rotation' in patch && patch.rotation === undefined) next.rotation = null;
	gameStore.updateState({
		snapPoints: { [id]: next as Partial<SnapPointState> }
	} as Parameters<typeof gameStore.updateState>[0]);
}

function removeSnapPoint(id: string) {
	gameStore.updateState({ snapPoints: { [id]: null } });
}

/** Drop every snap point on the table (the editor's clear, and scenario load). */
function clearSnapPoints() {
	const ids = Object.keys(get(gameStore)?.snapPoints ?? {});
	if (!ids.length) return;
	const update: Record<string, null> = {};
	for (const id of ids) update[id] = null;
	gameStore.updateState({ snapPoints: update });
}

export const snapActions = {
	addSnapPoint,
	moveSnapPoint,
	updateSnapPoint,
	removeSnapPoint,
	clearSnapPoints,
	snapPointIds
};
