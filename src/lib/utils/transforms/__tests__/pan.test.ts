/**
 * WASD has to mean the same thing after you have spun the table around, and it
 * has to mean anything at all from the seat's default view — which looks
 * straight down, where the eye→target vector has no horizontal component to
 * take a heading from. Both are pinned here.
 */
import { describe, expect, it } from 'vitest';
import { PAN_LIMIT_X, isPanKey, panBasis, panDelta, panSpeed, type Vec3 } from '../pan';

/** the seat-0 default: 25 units up, looking straight down, up-axis toward -Z */
const TOP_DOWN = {
	up: [0, 0.0001, -1] as Vec3,
	eye: [0, 25, 0] as Vec3,
	target: [0, 0, 0] as Vec3
};

const SECOND = 1;

describe('panBasis', () => {
	it('reads the heading off the camera up-axis, which a top-down view still has', () => {
		const basis = panBasis(TOP_DOWN.up, TOP_DOWN.eye, TOP_DOWN.target)!;
		expect(basis.forward[0]).toBeCloseTo(0);
		expect(basis.forward[1]).toBeCloseTo(-1); // away from the viewer is -Z here
		expect(basis.right[0]).toBeCloseTo(1);
		expect(basis.right[1]).toBeCloseTo(0);
	});

	it('turns with the orbit — a quarter turn round makes W point along +X', () => {
		const basis = panBasis([1, 0.2, 0], [-10, 10, 0], [0, 0, 0])!;
		expect(basis.forward[0]).toBeCloseTo(1);
		expect(basis.right[1]).toBeCloseTo(1);
	});

	it('falls back to the view vector when the camera is nearly flat', () => {
		const basis = panBasis([0, 1, 0], [0, 1, 10], [0, 1, 0])!;
		expect(basis.forward[1]).toBeCloseTo(-1);
	});

	it('gives up rather than guessing when there is no heading at all', () => {
		expect(panBasis([0, 1, 0], [0, 5, 0], [0, 0, 0])).toBeNull();
	});
});

describe('panDelta', () => {
	const step = (keys: string[], seconds = SECOND) =>
		panDelta(keys, TOP_DOWN.up, TOP_DOWN.eye, TOP_DOWN.target, seconds);

	it('moves away from the viewer on W and toward it on S', () => {
		expect(step(['KeyW'])![1]).toBeLessThan(0);
		expect(step(['KeyS'])![1]).toBeGreaterThan(0);
	});

	it('moves right on D and left on A', () => {
		expect(step(['KeyD'])![0]).toBeGreaterThan(0);
		expect(step(['KeyA'])![0]).toBeLessThan(0);
	});

	it('keeps a diagonal the same speed as a straight line', () => {
		const straight = Math.hypot(...step(['KeyW'])!);
		const diagonal = Math.hypot(...step(['KeyW', 'KeyD'])!);
		expect(diagonal).toBeCloseTo(straight, 5);
	});

	it('answers nothing for no keys, opposing keys, or a still frame', () => {
		expect(step([])).toBeNull();
		expect(step(['KeyW', 'KeyS'])).toBeNull();
		expect(step(['KeyW'], 0)).toBeNull();
	});

	it('caps the per-frame step, so a stalled frame cannot teleport the camera', () => {
		const long = Math.hypot(...step(['KeyW'], 5)!);
		const capped = Math.hypot(...step(['KeyW'], 0.1)!);
		expect(long).toBeCloseTo(capped, 5);
	});

	it('stops at the edge of the world instead of flying off it', () => {
		const atEdge: Vec3 = [PAN_LIMIT_X, 0, 0];
		const delta = panDelta(['KeyD'], TOP_DOWN.up, [PAN_LIMIT_X, 25, 0], atEdge, SECOND);
		expect(delta).toBeNull();
		// and back the other way still works
		expect(panDelta(['KeyA'], TOP_DOWN.up, [PAN_LIMIT_X, 25, 0], atEdge, SECOND)![0]).toBeLessThan(
			0
		);
	});

	it('pans faster the further out the camera is', () => {
		expect(panSpeed([0, 30, 0], [0, 0, 0])).toBeGreaterThan(panSpeed([0, 8, 0], [0, 0, 0]));
	});
});

describe('isPanKey', () => {
	it('claims WASD and nothing else', () => {
		expect(['KeyW', 'KeyA', 'KeyS', 'KeyD'].every(isPanKey)).toBe(true);
		expect(isPanKey('KeyF')).toBe(false);
		expect(isPanKey('ShiftLeft')).toBe(false);
	});
});
