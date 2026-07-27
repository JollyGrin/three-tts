/**
 * The `model:` ref grammar and its manifest resolution (tableplace-135).
 * Pure functions only — the fetch/store layer is exercised in e2e, where a
 * real manifest is served.
 */
import { describe, expect, it } from 'vitest';
import {
	makeModelRef,
	modelFootprintRadius,
	parseModelRef,
	resolveModelRef,
	MODEL_CELL_WORLD,
	type ModelCatalog
} from '../catalog';

const CATALOG: ModelCatalog = {
	kits: {
		'kenney-cave': {
			name: 'Modular Cave Kit',
			base: '/models/kenney-cave/',
			scale: 0.5,
			license: 'CC0-1.0',
			credit: 'Kenney (www.kenney.nl)',
			link: 'https://kenney.nl/assets/modular-cave-kit',
			models: {
				'room-large': {
					file: 'room-large.glb',
					thumb: 'thumbs/room-large.png',
					category: 'rooms',
					cells: [5, 5],
					vertices: 24240,
					triangles: 8080
				},
				corridor: {
					file: 'corridor.glb',
					thumb: 'thumbs/corridor.png',
					category: 'corridors',
					cells: [1, 1],
					vertices: 1567,
					triangles: 522
				}
			}
		}
	}
};

describe('parseModelRef', () => {
	it('splits kit and name at the first slash', () => {
		expect(parseModelRef('model:kenney-cave/room-large')).toEqual({
			kit: 'kenney-cave',
			name: 'room-large'
		});
	});

	it('keeps later slashes inside the name', () => {
		expect(parseModelRef('model:some-kit/nested/name')).toEqual({
			kit: 'some-kit',
			name: 'nested/name'
		});
	});

	it('round-trips through makeModelRef', () => {
		expect(parseModelRef(makeModelRef('kenney-cave', 'gate'))).toEqual({
			kit: 'kenney-cave',
			name: 'gate'
		});
	});

	it('rejects other schemes and malformed refs without throwing', () => {
		for (const bad of [
			'https://example.com/x.glb',
			'sheet:{"url":"x"}',
			'model:',
			'model:no-slash',
			'model:/leading',
			'model:trailing/',
			'',
			null,
			undefined
		]) {
			expect(parseModelRef(bad)).toBeNull();
		}
	});
});

describe('resolveModelRef', () => {
	it('resolves url, thumb, scale and world footprint through the manifest', () => {
		const resolved = resolveModelRef(CATALOG, 'model:kenney-cave/room-large')!;
		expect(resolved.url).toBe('/models/kenney-cave/room-large.glb');
		expect(resolved.thumbUrl).toBe('/models/kenney-cave/thumbs/room-large.png');
		expect(resolved.scale).toBe(0.5);
		// 5×5 cells at 2.0 world units per cell
		expect(resolved.footprint).toEqual([5 * MODEL_CELL_WORLD, 5 * MODEL_CELL_WORLD]);
	});

	it('answers null for unknown kits, unknown models, and no manifest', () => {
		expect(resolveModelRef(CATALOG, 'model:unknown-kit/room-large')).toBeNull();
		expect(resolveModelRef(CATALOG, 'model:kenney-cave/no-such-model')).toBeNull();
		expect(resolveModelRef(null, 'model:kenney-cave/room-large')).toBeNull();
		expect(resolveModelRef(CATALOG, 'not-a-model-ref')).toBeNull();
	});
});

describe('modelFootprintRadius', () => {
	it('is the footprint half-diagonal', () => {
		const resolved = resolveModelRef(CATALOG, 'model:kenney-cave/corridor')!;
		// 2×2 world footprint → half-diagonal √2
		expect(modelFootprintRadius(resolved)).toBeCloseTo(Math.hypot(2, 2) / 2, 2);
	});
});
