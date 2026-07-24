import { TABLE_TOP_Y } from './constants-table';

/** Thickness of a flat token/counter disc */
export const PIECE_THICKNESS = 0.16;

/** Resting height of a piece centre: table top + half the disc thickness */
export const PIECE_REST_Y = TABLE_TOP_Y + PIECE_THICKNESS / 2;

/** Footprint radius used when a piece doesn't declare one */
export const PIECE_DEFAULT_RADIUS = 0.75;

/** Height a piece floats at while being dragged */
export const PIECE_DRAG_Y = 1.2;

/**
 * Radius a hand-spawned piece is given per kind. Tokens and counters are flat
 * discs; pawns are procedural (base + stem + head) but sized off the same
 * radius. These match what the TTS parser assigns, so imported and
 * hand-spawned pieces of the same kind come out the same size.
 */
export const PIECE_RADIUS = {
	token: PIECE_DEFAULT_RADIUS,
	pawn: 0.3,
	counter: 0.6
} as const;

/** Starting max for a hand-spawned health dial */
export const COUNTER_MAX_DEFAULT = 20;
