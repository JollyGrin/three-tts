/**
 * The dice primitives are pure geometry, so the things that can silently go
 * wrong are geometric: a shape whose "faces" are secretly creased (the d10 is
 * only planar for one apex height), a numbering that skips or repeats a value,
 * or a UV mapping that puts a number on the wrong facet. All of that is
 * checkable without a renderer, which is the point of keeping it out of the
 * component.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { dieModel, dieRestOffset, dieSettleQuaternion } from '../die';
import { DIE_SIDES } from '$lib/utils/constants-pieces';

const UP = new THREE.Vector3(0, 1, 0);

function positionsOf(model: ReturnType<typeof dieModel>) {
	return model.geometry.getAttribute('position');
}

/** the distinct flat faces of the built geometry, recovered from its normals */
function faceNormals(model: ReturnType<typeof dieModel>) {
	const position = positionsOf(model);
	const normals: THREE.Vector3[] = [];
	for (let t = 0; t < position.count / 3; t++) {
		const a = new THREE.Vector3().fromBufferAttribute(position, t * 3);
		const b = new THREE.Vector3().fromBufferAttribute(position, t * 3 + 1);
		const c = new THREE.Vector3().fromBufferAttribute(position, t * 3 + 2);
		const n = new THREE.Vector3()
			.subVectors(b, a)
			.cross(new THREE.Vector3().subVectors(c, a))
			.normalize();
		if (!normals.some((existing) => existing.dot(n) > 0.9995)) normals.push(n);
	}
	return normals;
}

describe.each(DIE_SIDES)('d%i', (sides) => {
	const model = dieModel(sides);

	it('has exactly one flat face per side', () => {
		expect(faceNormals(model)).toHaveLength(sides);
	});

	it('is a convex solid of circumradius 1 — every face plane is outside every corner', () => {
		const position = positionsOf(model);
		const corners: THREE.Vector3[] = [];
		for (let i = 0; i < position.count; i++) {
			corners.push(new THREE.Vector3().fromBufferAttribute(position, i));
		}
		expect(Math.max(...corners.map((c) => c.length()))).toBeCloseTo(1, 5);

		// a creased "face" shows up here: its plane would cut through the solid
		for (const normal of faceNormals(model)) {
			const support = Math.max(...corners.map((c) => c.dot(normal)));
			for (const corner of corners) expect(corner.dot(normal)).toBeLessThanOrEqual(support + 1e-6);
		}
	});

	it('gives every value from 1 to sides a settled orientation and a printed number', () => {
		expect(model.upDirs).toHaveLength(sides);
		expect(model.atlas.cells).toHaveLength(sides);
		// where each number is *printed* is per-shape (a d4 prints at the
		// corners — see below); that it is printed at all is not
		const printed = new Set(model.atlas.cells.flat().map((label) => label.text));
		for (let value = 1; value <= sides; value++) {
			expect(printed).toContain(String(value));
			expect(model.upDirs[value - 1].length()).toBeCloseTo(1, 6);
		}
	});

	it('settles with the winning direction straight up, resting on the table', () => {
		for (let value = 1; value <= sides; value++) {
			const quaternion = dieSettleQuaternion(sides, value);
			const up = model.upDirs[value - 1].clone().applyQuaternion(quaternion);
			expect(up.angleTo(UP)).toBeLessThan(1e-6);

			// nothing pokes through the table, and something touches it
			const position = positionsOf(model);
			let lowest = Infinity;
			for (let i = 0; i < position.count; i++) {
				const corner = new THREE.Vector3().fromBufferAttribute(position, i);
				lowest = Math.min(lowest, corner.applyQuaternion(quaternion).y);
			}
			expect(lowest + model.restOffset).toBeCloseTo(0, 5);
		}
	});

	it('maps each face onto its own atlas cell', () => {
		const { cols, rows } = model.atlas;
		const uv = model.geometry.getAttribute('uv');
		const position = positionsOf(model);

		for (let t = 0; t < position.count / 3; t++) {
			const cells = new Set<number>();
			for (let k = 0; k < 3; k++) {
				// nudge off the cell boundary before flooring: a corner maps exactly
				// onto the edge of its own cell
				const col = Math.floor(uv.getX(t * 3 + k) * cols * (1 - 1e-9));
				const row = Math.floor((1 - uv.getY(t * 3 + k)) * rows * (1 - 1e-9));
				cells.add(row * cols + col);
			}
			expect(cells.size).toBe(1);
			expect([...cells][0]).toBeLessThan(sides);
		}
	});
});

/**
 * The one thing a geometry test cannot infer from face counts and normals:
 * whether the numbers are actually *readable*. A glyph drawn outside its face's
 * slice of the atlas cell is simply clipped away by the triangle it sits on, so
 * a die can be perfectly formed and still show half a "20".
 *
 * The face polygon is recoverable from the UVs, and where each glyph lands is
 * fixed by the atlas, so containment is checkable without ever rasterising.
 */
describe('every number fits inside the face it is printed on', () => {
	/** rough metrics for the sans-serif digits we draw, as fractions of the font size */
	const GLYPH_WIDTH = 0.58;
	const GLYPH_HEIGHT = 0.74;

	function inTriangle(px: number, py: number, tri: [number, number][]) {
		const sign = (a: [number, number], b: [number, number]) =>
			(px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
		const d1 = sign(tri[0], tri[1]);
		const d2 = sign(tri[1], tri[2]);
		const d3 = sign(tri[2], tri[0]);
		const negative = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
		const positive = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
		return !(negative && positive);
	}

	it.each(DIE_SIDES)('d%i', (sides) => {
		const model = dieModel(sides);
		const { cols, rows, cells, fontScale, fit } = model.atlas;
		const uv = model.geometry.getAttribute('uv');

		// the face polygon, as triangles in the same -1…1 space the labels use
		const triangles = new Map<number, [number, number][][]>();
		for (let t = 0; t < uv.count / 3; t++) {
			const corners = [0, 1, 2].map((k) => {
				const u = uv.getX(t * 3 + k);
				const v = uv.getY(t * 3 + k);
				const col = Math.floor(u * cols * (1 - 1e-9));
				const row = Math.floor((1 - v) * rows * (1 - 1e-9));
				return {
					cell: row * cols + col,
					x: ((u * cols - col - 0.5) * 2) / fit,
					y: ((row + 0.5 - (1 - v) * rows) * 2) / fit
				};
			});
			const cell = corners[0].cell;
			const list = triangles.get(cell) ?? [];
			list.push(corners.map((c) => [c.x, c.y]) as [number, number][]);
			triangles.set(cell, list);
		}

		// glyph half-extents in the same units
		const halfHeight = (GLYPH_HEIGHT * fontScale) / fit;

		cells.forEach((labels, cell) => {
			const faceTriangles = triangles.get(cell) ?? [];
			expect(faceTriangles.length).toBeGreaterThan(0);

			for (const label of labels) {
				const halfWidth = (GLYPH_WIDTH * fontScale * label.text.length) / fit;
				const box: [number, number][] = [
					[label.x - halfWidth, label.y - halfHeight],
					[label.x + halfWidth, label.y - halfHeight],
					[label.x - halfWidth, label.y + halfHeight],
					[label.x + halfWidth, label.y + halfHeight]
				];
				for (const [px, py] of box) {
					const inside = faceTriangles.some((tri) => inTriangle(px, py, tri));
					expect(
						inside,
						`d${sides}: "${label.text}" at (${label.x.toFixed(2)}, ${label.y.toFixed(2)}) ` +
							`overhangs its face at corner (${px.toFixed(2)}, ${py.toFixed(2)})`
					).toBe(true);
				}
			}
		});
	});
});

describe('numbering convention', () => {
	it('puts opposite faces on opposite sides of the die: they sum to sides + 1', () => {
		// every shape here but the tetrahedron is centrally symmetric
		for (const sides of DIE_SIDES.filter((s) => s !== 4)) {
			const { upDirs } = dieModel(sides);
			for (let value = 1; value <= sides; value++) {
				const opposite = upDirs[sides - value];
				expect(upDirs[value - 1].dot(opposite)).toBeLessThan(-0.9995);
			}
		}
	});

	it('reads a d4 at its raised vertex, so every visible face agrees on the value', () => {
		const { atlas, upDirs } = dieModel(4);
		// vertex `value - 1` up ⇒ the three faces that touch it all print `value`
		for (let value = 1; value <= 4; value++) {
			const facesAtVertex = atlas.cells.filter((cell) =>
				cell.some((label) => label.text === String(value))
			);
			expect(facesAtVertex).toHaveLength(3);
			// …and it is the face *opposite* that vertex which is missing it
			expect(atlas.cells[value - 1].map((l) => l.text)).not.toContain(String(value));
			expect(upDirs[value - 1].length()).toBeCloseTo(1, 6);
		}
	});
});

describe('dieRestOffset', () => {
	it('scales the settled centre height with the die radius', () => {
		expect(dieRestOffset(6, 1)).toBeCloseTo(dieModel(6).restOffset, 10);
		expect(dieRestOffset(6, 0.5)).toBeCloseTo(dieModel(6).restOffset / 2, 10);
	});

	it('sits a d20 closer to the table than a d4 of the same radius — it is rounder', () => {
		expect(dieRestOffset(20, 1)).toBeGreaterThan(dieRestOffset(4, 1));
	});
});
