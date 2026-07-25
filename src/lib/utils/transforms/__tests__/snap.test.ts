import { describe, it, expect } from 'vitest';
import { applySnapRotation, resolveSnap, snapRadius } from '../snap';
import { SNAP_RADIUS_DEFAULT, SNAP_RADIUS_MAX, SNAP_RADIUS_MIN } from '$lib/utils/constants-snap';
import type { GameDTO } from '$lib/store/game/types';

const points = (
	...entries: [string, { position?: [number, number]; rotation?: number; radius?: number } | null][]
): GameDTO['snapPoints'] => Object.fromEntries(entries);

describe('snapRadius', () => {
	it('falls back to the shared default', () => {
		expect(snapRadius({})).toBe(SNAP_RADIUS_DEFAULT);
		expect(snapRadius(undefined)).toBe(SNAP_RADIUS_DEFAULT);
	});

	it('honours an authored radius', () => {
		expect(snapRadius({ radius: 2.5 })).toBe(2.5);
	});

	it('clamps values that could never catch a drop, or would catch everything', () => {
		expect(snapRadius({ radius: 0 })).toBe(SNAP_RADIUS_MIN);
		expect(snapRadius({ radius: -3 })).toBe(SNAP_RADIUS_MIN);
		expect(snapRadius({ radius: 9999 })).toBe(SNAP_RADIUS_MAX);
	});

	it('ignores a non-finite radius', () => {
		expect(snapRadius({ radius: Number.NaN })).toBe(SNAP_RADIUS_DEFAULT);
	});
});

describe('resolveSnap', () => {
	it('catches a drop inside the radius', () => {
		const snap = resolveSnap(points(['snap:0', { position: [4, 2], radius: 1 }]), 4.5, 2);
		expect(snap).toMatchObject({ id: 'snap:0', x: 4, z: 2, radius: 1 });
		expect(snap?.distance).toBeCloseTo(0.5);
	});

	it('ignores a drop outside the radius', () => {
		expect(resolveSnap(points(['snap:0', { position: [4, 2], radius: 1 }]), 5.5, 2)).toBeNull();
	});

	it('catches a drop exactly on the radius', () => {
		expect(resolveSnap(points(['snap:0', { position: [0, 0], radius: 1 }]), 1, 0)).toMatchObject({
			id: 'snap:0'
		});
	});

	it('uses the default radius when the point omits one', () => {
		const p = points(['snap:0', { position: [0, 0] }]);
		expect(resolveSnap(p, SNAP_RADIUS_DEFAULT - 0.01, 0)).toMatchObject({ id: 'snap:0' });
		expect(resolveSnap(p, SNAP_RADIUS_DEFAULT + 0.01, 0)).toBeNull();
	});

	it('lets the nearest point win when radii overlap', () => {
		const p = points(
			['snap:0', { position: [0, 0], radius: 3 }],
			['snap:1', { position: [2, 0], radius: 3 }]
		);
		expect(resolveSnap(p, 1.4, 0)?.id).toBe('snap:1');
		expect(resolveSnap(p, 0.6, 0)?.id).toBe('snap:0');
	});

	it('breaks an exact tie on id, so record order cannot decide a snap', () => {
		const near = { position: [0, 0] as [number, number], radius: 2 };
		const far = { position: [2, 0] as [number, number], radius: 2 };
		const forward = resolveSnap(points(['snap:0', near], ['snap:1', far]), 1, 0);
		const reversed = resolveSnap(points(['snap:1', far], ['snap:0', near]), 1, 0);
		expect(forward?.id).toBe('snap:0');
		expect(reversed?.id).toBe('snap:0');
	});

	it('carries the authored rotation, and reports none when there is none', () => {
		expect(
			resolveSnap(points(['snap:0', { position: [0, 0], rotation: 90 }]), 0, 0)?.rotation
		).toBe(90);
		expect(resolveSnap(points(['snap:0', { position: [0, 0] }]), 0, 0)?.rotation).toBeUndefined();
	});

	it('keeps a rotation of 0, which is an authored facing and not "unset"', () => {
		expect(resolveSnap(points(['snap:0', { position: [0, 0], rotation: 0 }]), 0, 0)?.rotation).toBe(
			0
		);
	});

	it('skips deleted and malformed entries', () => {
		const p = points(
			['snap:0', null],
			// @ts-expect-error deliberately malformed: a wire patch can carry anything
			['snap:1', { position: ['x', 2] }],
			['snap:2', { position: [0, 0] }]
		);
		expect(resolveSnap(p, 0, 0)?.id).toBe('snap:2');
	});

	it('is unfazed by no snap points at all', () => {
		expect(resolveSnap(undefined, 0, 0)).toBeNull();
		expect(resolveSnap({}, 0, 0)).toBeNull();
	});
});

describe('applySnapRotation', () => {
	it('leaves the rotation alone when the point authored none', () => {
		expect(applySnapRotation([180, 0, 45], undefined, 'card')).toEqual([180, 0, 45]);
		expect(applySnapRotation([0, 30, 0], undefined, 'piece')).toEqual([0, 30, 0]);
		expect(applySnapRotation([0, Math.PI, 0], undefined, 'deck')).toEqual([0, Math.PI, 0]);
	});

	it('writes a card yaw into z as degrees, preserving the facedown flip', () => {
		expect(applySnapRotation([180, 0, 45], 90, 'card')).toEqual([180, 0, 90]);
	});

	it('writes a piece yaw into y as degrees', () => {
		expect(applySnapRotation([0, 30, 0], 90, 'piece')).toEqual([0, 90, 0]);
	});

	it('writes a deck yaw into y as RADIANS — decks are the odd one out', () => {
		// Deck.svelte hands the triple to its <T.Group>; degrees here would spin
		// a snapped deck by a factor of 57 (tableplace-88 makes decks draggable)
		const [x, y, z] = applySnapRotation([0, 0, 0], 180, 'deck');
		expect([x, z]).toEqual([0, 0]);
		expect(y).toBeCloseTo(Math.PI);
	});
});
