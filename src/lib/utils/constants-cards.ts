import * as THREE from 'three';

/**
 * Physical card dimensions in world units.
 * Cards need real thickness so stacked cards never share a plane —
 * coplanar surfaces z-fight regardless of depth-buffer precision.
 */
export const CARD_WIDTH = 1.4;
export const CARD_HEIGHT = 2;
export const CARD_THICKNESS = 0.03;

/** Corner radius of the printed face (ImageMaterial radius prop) */
export const CARD_CORNER_RADIUS = 0.1;

function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
	const w = width / 2;
	const h = height / 2;
	const s = new THREE.Shape();
	s.moveTo(-w + radius, -h);
	s.lineTo(w - radius, -h);
	s.absarc(w - radius, -h + radius, radius, -Math.PI / 2, 0, false);
	s.lineTo(w, h - radius);
	s.absarc(w - radius, h - radius, radius, 0, Math.PI / 2, false);
	s.lineTo(-w + radius, h);
	s.absarc(-w + radius, h - radius, radius, Math.PI / 2, Math.PI, false);
	s.lineTo(-w, -h + radius);
	s.absarc(-w + radius, -h + radius, radius, Math.PI, Math.PI * 1.5, false);
	return s;
}

/**
 * Rounded-rect slab lying flat: width along X, height along Z, thickness
 * along Y, centered on the origin. Extrude side-wall UVs put v along the
 * thickness axis (v = 1 - z before rotation), so a repeat-wrapped texture's
 * rows wrap around the sides as horizontal bands.
 */
function roundedSlabGeometry(
	width: number,
	height: number,
	radius: number,
	thickness: number
): THREE.ExtrudeGeometry {
	const geometry = new THREE.ExtrudeGeometry(roundedRectShape(width, height, radius), {
		depth: thickness,
		bevelEnabled: false,
		curveSegments: 8
	});
	geometry.translate(0, 0, -thickness / 2);
	geometry.rotateX(-Math.PI / 2);
	return geometry;
}

/**
 * Shared body geometry for every card: same footprint and corner radius as
 * the printed face, so the two share one silhouette with no overhanging lip.
 * The body is thinner than CARD_THICKNESS (see roundedSlabGeometry call
 * below) so its flat lids sit just under the face planes — that vertical gap
 * avoids z-fighting between the white lid and the printed face; it's not a
 * lateral inset. Static — build once, share across all card instances.
 */
export const cardBodyGeometry = roundedSlabGeometry(
	CARD_WIDTH,
	CARD_HEIGHT,
	CARD_CORNER_RADIUS,
	CARD_THICKNESS * 0.92
);

/**
 * Shared deck body geometry, unit height (scale the mesh's Y to the deck's
 * actual height). Side-wall v spans exactly 0..1 over the unit thickness, so
 * texture.repeat.y = number of stripe-texture repeats across the full height.
 * Same footprint/radius as the card face — no lateral inset (see cardBodyGeometry).
 */
export const deckBodyGeometry = roundedSlabGeometry(CARD_WIDTH, CARD_HEIGHT, CARD_CORNER_RADIUS, 1);

/**
 * Deck body height per card, clamped so a huge deck doesn't tower and an
 * almost-empty pile is still grabbable. 40 cards ≈ the old fixed 0.4 slab.
 */
export const DECK_HEIGHT_PER_CARD = 0.01;
export const DECK_MIN_HEIGHT = 0.1;
export const DECK_MAX_HEIGHT = 0.5;
export function deckHeightForCount(count: number): number {
	return THREE.MathUtils.clamp(count * DECK_HEIGHT_PER_CARD, DECK_MIN_HEIGHT, DECK_MAX_HEIGHT);
}

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

/**
 * Per-card cascade of a hovered loose pile (render-only, see `fanOffset`).
 * Roughly a fifth of the card's 2-unit length: enough of the top edge to read
 * the title band, without throwing a big pile across the felt.
 */
export const CARD_FAN_STEP = 0.42;
