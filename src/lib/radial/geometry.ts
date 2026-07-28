/**
 * The wheel's geometry, as pure functions — no DOM, no store.
 *
 * Selection is by ANGLE from the press origin, never by what the pointer is
 * over: a flick is a direction, and asking the browser what element is under a
 * fast-moving cursor answers with whatever the last frame drew. The same
 * numbers place the wedges, so what the eye aims at and what the maths picks
 * are the same thing by construction.
 *
 * Angles are radians, 0 = straight up, increasing clockwise (screen y grows
 * downward, so "up" is -y).
 */

/** px the pointer must leave the centre before any wedge is selected */
export const RADIAL_DEADZONE_PX = 34;
/** inner and outer radius of the drawn ring */
export const RADIAL_INNER_PX = 46;
export const RADIAL_OUTER_PX = 116;
/** where a wedge's label (and its click target in sticky mode) sits */
export const RADIAL_LABEL_PX = (RADIAL_INNER_PX + RADIAL_OUTER_PX) / 2;
/** half the box the overlay reserves — outer radius plus room for the labels */
export const RADIAL_BOX_PX = 150;

/** centre angle of wedge `index`, evenly spaced from the top, clockwise */
export function wedgeAngle(index: number, count: number): number {
	if (count <= 0) return 0;
	return (index * 2 * Math.PI) / count;
}

/**
 * Angular width of a wedge.
 *
 * Capped at a third of the circle so a sparse wheel — the table's single
 * "Reset view" is the v1 case — does not turn every direction into a hit. With
 * three or more options the wedges tile the circle exactly, which is what makes
 * a four-option wheel feel like up/right/down/left.
 */
export function wedgeSpan(count: number): number {
	return (2 * Math.PI) / Math.max(count, 3);
}

/** signed difference between two angles, in (-π, π] */
function angleDelta(a: number, b: number): number {
	return ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

/**
 * Which wedge a pointer offset from the origin picks, or null for "none" —
 * inside the deadzone, or in the gap of a sparse wheel. Null is a real answer:
 * releasing there dismisses without acting.
 */
export function selectWedge(
	dx: number,
	dy: number,
	count: number,
	deadzone = RADIAL_DEADZONE_PX
): number | null {
	if (count <= 0) return null;
	if (Math.hypot(dx, dy) < deadzone) return null;
	const angle = Math.atan2(dx, -dy);
	const step = (2 * Math.PI) / count;
	const index = ((Math.round(angle / step) % count) + count) % count;
	return Math.abs(angleDelta(angle, wedgeAngle(index, count))) <= wedgeSpan(count) / 2
		? index
		: null;
}

/** offset from the origin, in px, of a wedge's label */
export function wedgeLabelOffset(
	index: number,
	count: number,
	radius = RADIAL_LABEL_PX
): { x: number; y: number } {
	const angle = wedgeAngle(index, count);
	return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}

function point(angle: number, radius: number): string {
	return `${(Math.sin(angle) * radius).toFixed(3)} ${(-Math.cos(angle) * radius).toFixed(3)}`;
}

/**
 * `d` for an annulus sector centred on wedge `index`, in a coordinate system
 * whose origin is the press point. Drawn even for the sparse case, so the gap
 * where nothing is selectable is visible rather than merely felt.
 */
export function wedgePath(
	index: number,
	count: number,
	inner = RADIAL_INNER_PX,
	outer = RADIAL_OUTER_PX
): string {
	const half = wedgeSpan(count) / 2;
	const centre = wedgeAngle(index, count);
	const from = centre - half;
	const to = centre + half;
	// a full circle cannot be drawn as one arc (start and end coincide), and a
	// one-option wheel never spans one anyway — see wedgeSpan
	const large = wedgeSpan(count) > Math.PI ? 1 : 0;
	return [
		`M ${point(from, inner)}`,
		`L ${point(from, outer)}`,
		`A ${outer} ${outer} 0 ${large} 1 ${point(to, outer)}`,
		`L ${point(to, inner)}`,
		`A ${inner} ${inner} 0 ${large} 0 ${point(from, inner)}`,
		'Z'
	].join(' ');
}
