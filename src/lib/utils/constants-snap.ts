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

/**
 * Sanity ceiling for an authored radius — a whole-table snap point is a bug.
 * Deliberately not applied to a grid's extent: a grid covers area on purpose.
 */
export const SNAP_RADIUS_MAX = 15;

/**
 * Yaw stepping a grid applies when it doesn't author `yawStep`: snapped
 * entities' yaw rounds to the nearest 90° — the modular-kit case, and the
 * right-angle world most tile-layers live in.
 */
export const SNAP_GRID_YAW_STEP_DEFAULT = 90;

/** What the editor stamps on a point freshly switched to `kind: 'grid'`. */
export const SNAP_GRID_PITCH_DEFAULT = 2;
export const SNAP_GRID_COLS_DEFAULT = 3;
export const SNAP_GRID_ROWS_DEFAULT = 3;

/** y the editor draws snap markers at: on the felt, under everything that rests on it. */
export const SNAP_MARKER_Y = TABLE_TOP_Y + 0.0015;

/** Editor marker colors: idle, and while being dragged. */
export const SNAP_MARKER_COLOR = '#a78bfa';
export const SNAP_MARKER_COLOR_ACTIVE = '#f0abfc';

/** Color the drop preview uses when a drop is caught by a snap point. */
export const SNAP_DROP_COLOR = '#c4b5fd';
