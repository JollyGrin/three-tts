import { get } from 'svelte/store';
import { gameActions } from '.';
import { gameStore } from '../gameStore.svelte';
import { degrees } from '$lib/utils/constants-rotation';
import { COUNTER_MAX_DEFAULT, PIECE_RADIUS, PIECE_REST_Y } from '$lib/utils/constants-pieces';
import type { GameDTO, PackOrigin, PieceKind, PieceStateDTO } from '../types';

type PieceState = NonNullable<NonNullable<GameDTO['pieces']>[string]>;

function getPieceState(pieceId: string) {
	return get(gameStore)?.pieces?.[pieceId];
}

function removePiece(pieceId: string) {
	return gameStore.updateState({ pieces: { [pieceId]: null } });
}

function movePiece(pieceId: string, position: [number, number, number]) {
	return gameStore.updateState({ pieces: { [pieceId]: { position } } });
}

/** Adjust a counter piece's value, clamped to [0, maxValue] */
function incrementCounter(pieceId: string, delta: number) {
	const piece = getPieceState(pieceId);
	if (!piece || piece.kind !== 'counter') return;
	const max = piece.maxValue ?? 99;
	const value = Math.min(max, Math.max(0, (piece.value ?? max) + delta));
	return gameStore.updateState({ pieces: { [pieceId]: { value } } });
}

/**
 * The state index a piece is actually showing: clamped into its `states`
 * array, and 0 for a piece that has none. Shared by the renderer and the
 * cycle/select verbs so they can never disagree about what is on the table.
 */
function currentPieceState(
	piece: { states?: PieceStateDTO[]; state?: number } | null | undefined
): number {
	const count = piece?.states?.length ?? 0;
	if (count === 0) return 0;
	return Math.min(Math.max(Math.trunc(piece?.state ?? 0), 0), count - 1);
}

/**
 * Show one of a multi-state piece's faces. Out-of-range indexes wrap, so
 * `setPieceState(id, current + 1)` is the cycle verb and a menu can pass an
 * absolute index. No-op on a piece with fewer than two states.
 */
function setPieceState(pieceId: string, index: number) {
	const piece = getPieceState(pieceId);
	const count = piece?.states?.length ?? 0;
	if (count < 2) return;
	const wrapped = ((Math.trunc(index) % count) + count) % count;
	if (wrapped === currentPieceState(piece)) return;
	return gameStore.updateState({ pieces: { [pieceId]: { state: wrapped } } });
}

/** Step a multi-state piece to its next (or previous) face. */
function cyclePieceState(pieceId: string, delta = 1) {
	const piece = getPieceState(pieceId);
	if ((piece?.states?.length ?? 0) < 2) return;
	return setPieceState(pieceId, currentPieceState(piece) + delta);
}

/** Spawns fan sideways in front of the acting seat, wrapping to further rows. */
const SPAWN_SPACING = 1.6;
const SPAWN_PER_ROW = 8;
const SPAWN_EDGE_Z = 4.5;

const KIND_LABEL: Record<PieceKind, string> = {
	token: 'Token',
	pawn: 'Pawn',
	counter: 'Counter'
};

function slugify(name: string, fallback: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || fallback;
}

/**
 * Seat of the acting owner. The scenario editor owns entities with
 * `seat0`…`seat3` placeholders (see scenario.ts) — matched here by shape
 * rather than by import, since scenario.ts already imports these actions.
 */
function ownerSeat(ownerId: string): number {
	const placeholder = /^seat([0-3])$/.exec(ownerId);
	if (placeholder) return Number(placeholder[1]);
	return get(gameStore)?.players?.[ownerId]?.seat ?? 0;
}

/** Rotate a seat-local (x, z) offset into world space around the table center */
function seatToWorld(seat: number, x: number, z: number): [number, number] {
	const theta = degrees[seat % degrees.length];
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	const round = (v: number) => Math.round(v * 1000) / 1000;
	return [round(x * cos + z * sin), round(z * cos - x * sin)];
}

function spawnPosition(seat: number, index: number): [number, number, number] {
	const column = index % SPAWN_PER_ROW;
	const row = Math.floor(index / SPAWN_PER_ROW);
	// fan out from the middle of the seat's edge: 0, -1, +1, -2, +2, …
	const offsetX = Math.ceil(column / 2) * SPAWN_SPACING * (column % 2 === 1 ? -1 : 1);
	const [x, z] = seatToWorld(seat, offsetX, SPAWN_EDGE_Z - row * SPAWN_SPACING);
	return [x, PIECE_REST_Y, z];
}

/** ids are `kind:owner:slug` (claimSeat renames the owner segment) — `-n` disambiguates repeats */
function nextPieceId(ownerId: string, slug: string): string {
	const pieces = get(gameStore)?.pieces ?? {};
	let n = 0;
	while (pieces[`piece:${ownerId}:${slug}-${n}`]) n++;
	return `piece:${ownerId}:${slug}-${n}`;
}

export type AddPieceOptions = {
	name?: string;
	color?: string;
	/** resolved like card faces — a plain https:// url works */
	imageUrl?: string;
	/** multi-state pieces: every face, `states[0]` being the base one */
	states?: PieceStateDTO[];
	/** which of `states` to spawn showing (default 0) */
	state?: number;
	radius?: number;
	/** counters only; the piece spawns full (`value = maxValue`) unless `value` says otherwise */
	maxValue?: number;
	/** counters only; restores a saved count (scenario loads) instead of spawning full */
	value?: number;
	/** defaults to the local player; the scenario editor passes placeholder seat ids */
	ownerId?: string;
	position?: [number, number, number];
	rotation?: [number, number, number];
	/** set when the piece comes from a pack, so a v2 scenario can reference it */
	packOrigin?: PackOrigin;
};

/**
 * Spawn a token / pawn / counter in front of the acting seat.
 * Goes through updateState, so /play broadcasts to the lobby and /setup
 * stays local. Returns the new piece id ('' if there's no owner to spawn for).
 */
function addPiece(kind: PieceKind, opts: AddPieceOptions = {}): string {
	const ownerId = opts.ownerId || gameActions.getMyId();
	if (!ownerId) {
		console.error('Cannot add a piece without an owner id');
		return '';
	}

	const name = opts.name?.trim() || KIND_LABEL[kind];
	const id = nextPieceId(ownerId, slugify(name, kind));
	const owned = Object.keys(get(gameStore)?.pieces ?? {}).filter((key) =>
		key.includes(`:${ownerId}:`)
	).length;

	const piece: Partial<PieceState> = {
		kind,
		name,
		position: opts.position ?? spawnPosition(ownerSeat(ownerId), owned),
		rotation: opts.rotation ?? [0, 0, 0],
		radius: opts.radius ?? PIECE_RADIUS[kind]
	};
	if (opts.color) piece.color = opts.color;
	if (opts.imageUrl) piece.imageUrl = opts.imageUrl;
	if (opts.states?.length) {
		piece.states = opts.states.map((s) => ({ face: s.face, ...(s.name ? { name: s.name } : {}) }));
		piece.state = currentPieceState({ states: opts.states, state: opts.state });
	}
	if (opts.packOrigin) piece.packOrigin = opts.packOrigin;
	if (kind === 'counter') {
		const maxValue = opts.maxValue ?? COUNTER_MAX_DEFAULT;
		piece.maxValue = maxValue;
		piece.value = opts.value ?? maxValue;
	}

	gameStore.updateState({ pieces: { [id]: piece } });
	return id;
}

export const pieceActions = {
	getPieceState,
	addPiece,
	removePiece,
	movePiece,
	incrementCounter,
	currentPieceState,
	setPieceState,
	cyclePieceState
};
