/**
 * Table geometry in world units.
 * The felt is a 60×30 box centred on the origin; its top face is at
 * TABLE_TOP_Y (the box is 0.5 thick and sits with its centre at y = 0).
 */
export const TABLE_HALF_X = 30;
export const TABLE_HALF_Z = 15;
export const TABLE_TOP_Y = 0.255;

/**
 * Dragged entities are clamped this far inside the edge so they always land
 * on the felt and stay grabbable.
 */
export const EDGE_MARGIN = 1;
