/**
 * The wheel is only usable if "flick toward the label you can see" and "the
 * wedge the maths picks" are the same thing — both come from here, so these
 * tests pin the two together, plus the two answers that mean *nothing*: the
 * centre deadzone, and the gap left by a wheel with fewer than three options.
 */
import { describe, expect, it } from 'vitest';
import {
	RADIAL_DEADZONE_PX,
	selectWedge,
	wedgeAngle,
	wedgeLabelOffset,
	wedgePath,
	wedgeSpan
} from '../geometry';

describe('wedge layout', () => {
	it('spaces wedges from the top, clockwise', () => {
		expect(wedgeAngle(0, 4)).toBe(0);
		expect(wedgeAngle(1, 4)).toBeCloseTo(Math.PI / 2);
		expect(wedgeAngle(2, 4)).toBeCloseTo(Math.PI);
		expect(wedgeAngle(3, 4)).toBeCloseTo((3 * Math.PI) / 2);
	});

	it('puts the first label straight up the screen', () => {
		const { x, y } = wedgeLabelOffset(0, 4);
		expect(x).toBeCloseTo(0);
		expect(y).toBeLessThan(0); // screen y grows downward
	});

	it('tiles the circle from three options up, and never past a third below', () => {
		expect(wedgeSpan(4)).toBeCloseTo(Math.PI / 2);
		expect(wedgeSpan(8) * 8).toBeCloseTo(Math.PI * 2);
		expect(wedgeSpan(1)).toBeCloseTo(wedgeSpan(3));
	});

	it('draws a closed sector for every supported count', () => {
		for (let count = 1; count <= 8; count++) {
			for (let index = 0; index < count; index++) {
				const d = wedgePath(index, count);
				expect(d.endsWith('Z')).toBe(true);
				expect(d).not.toContain('NaN');
			}
		}
	});
});

describe('selectWedge', () => {
	it('picks the wedge the offset points at', () => {
		const far = 90;
		expect(selectWedge(0, -far, 4)).toBe(0); // up
		expect(selectWedge(far, 0, 4)).toBe(1); // right
		expect(selectWedge(0, far, 4)).toBe(2); // down
		expect(selectWedge(-far, 0, 4)).toBe(3); // left
	});

	it('agrees with where the label is drawn, for 1-8 options', () => {
		for (let count = 1; count <= 8; count++) {
			for (let index = 0; index < count; index++) {
				const { x, y } = wedgeLabelOffset(index, count);
				expect(selectWedge(x, y, count)).toBe(index);
			}
		}
	});

	it('selects nothing inside the deadzone — the release that cancels', () => {
		expect(selectWedge(0, 0, 4)).toBeNull();
		expect(selectWedge(0, -(RADIAL_DEADZONE_PX - 1), 4)).toBeNull();
		expect(selectWedge(0, -(RADIAL_DEADZONE_PX + 1), 4)).toBe(0);
	});

	it('leaves a sparse wheel with gaps rather than a hair trigger', () => {
		// one option: only the top third of the circle fires it
		expect(selectWedge(0, -90, 1)).toBe(0);
		expect(selectWedge(0, 90, 1)).toBeNull();
		expect(selectWedge(90, 0, 1)).toBeNull();
		// two: top and bottom, with the flanks dead
		expect(selectWedge(0, 90, 2)).toBe(1);
		expect(selectWedge(90, 0, 2)).toBeNull();
	});

	it('answers nothing for an empty wheel', () => {
		expect(selectWedge(0, -90, 0)).toBeNull();
	});
});
