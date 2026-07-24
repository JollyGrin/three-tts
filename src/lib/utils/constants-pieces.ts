import { TABLE_TOP_Y } from './constants-table';

/** Thickness of a flat token/counter disc */
export const PIECE_THICKNESS = 0.16;

/** Resting height of a piece centre: table top + half the disc thickness */
export const PIECE_REST_Y = TABLE_TOP_Y + PIECE_THICKNESS / 2;

/** Footprint radius used when a piece doesn't declare one */
export const PIECE_DEFAULT_RADIUS = 0.75;

/** Height a piece floats at while being dragged */
export const PIECE_DRAG_Y = 1.2;
