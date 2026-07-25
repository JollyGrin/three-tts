import { TABLE_TOP_Y } from './constants-table';

/**
 * Snap points — authored placement guides on the felt. A drop that lands
 * inside a point's catch radius finishes exactly on the point.
 */

/**
 * Catch radius for a snap point that doesn't declare one, in world units.
 * Sized off the card footprint: a shade under half a card's length, so two
 * snap points a card-length apart never fight over the same drop, and a drop
 * aimed at the point still catches if it lands anywhere over its middle.
 */
export const SNAP_RADIUS_DEFAULT = 0.9;

/** Below this a point could never catch anything; authored values clamp up. */
export const SNAP_RADIUS_MIN = 0.05;

/** Sanity ceiling for an authored radius — a whole-table snap point is a bug. */
export const SNAP_RADIUS_MAX = 15;

/** y the editor draws snap markers at: on the felt, under everything that rests on it. */
export const SNAP_MARKER_Y = TABLE_TOP_Y + 0.0015;

/** Editor marker colors: idle, and while being dragged. */
export const SNAP_MARKER_COLOR = '#a78bfa';
export const SNAP_MARKER_COLOR_ACTIVE = '#f0abfc';

/** Color the drop preview uses when a drop is caught by a snap point. */
export const SNAP_DROP_COLOR = '#c4b5fd';
