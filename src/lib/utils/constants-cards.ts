/**
 * Physical card dimensions in world units.
 * Cards need real thickness so stacked cards never share a plane —
 * coplanar surfaces z-fight regardless of depth-buffer precision.
 */
export const CARD_WIDTH = 1.4;
export const CARD_HEIGHT = 2;
export const CARD_THICKNESS = 0.04;

/** Resting height of a card lying directly on the table/overlay */
export const CARD_REST_Y = 0.26;

/**
 * Height a card floats at while being dragged. Shared by every drag entry
 * point (table, deck, tray) so the store position matches what is rendered —
 * the drop indicator's connector line is drawn to this height.
 */
export const CARD_DRAG_Y = 2;

/**
 * Max XZ center-distance for two cards to count as stacked.
 * Covers any overlap of two 1.4x2 cards regardless of tap rotation.
 */
export const CARD_STACK_RADIUS = 1.7;

/**
 * Cards above this height are mid-drag/animation and are ignored
 * when resolving where a dropped card should rest.
 */
export const CARD_STACK_MAX_Y = 1.0;
