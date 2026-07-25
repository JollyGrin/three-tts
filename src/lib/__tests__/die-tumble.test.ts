/**
 * A roll is sent as two numbers and the show is rebuilt from them on every
 * client, so these are the guarantees the wire cannot give us: that the replay
 * lands on the face the lobby agreed on, that two clients build the same
 * replay, and that a client which was not there does not replay it at all.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { rollAction, tumbleOrientation, tumbleSpin } from '../utils/die-tumble';
import { dieSettleQuaternion } from '$lib/primitives/die';
import { DIE_SIDES } from '$lib/utils/constants-pieces';

const angleBetween = (a: THREE.Quaternion, b: THREE.Quaternion) =>
	2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));

/**
 * Radians. `acos` near 1 amplifies float error, so an exact landing measures a
 * few 1e-8 rather than 0 — still a millionth of a degree, and six orders of
 * magnitude below the ~1° a wrong face would be off by.
 */
const EXACT = 1e-5;

describe('rollAction', () => {
	it('seeds silently the first time a die is seen, however many rolls it has had', () => {
		// the late joiner: the lobby is on roll 7 and we have never seen this die
		expect(rollAction(undefined, 7)).toBe('seed');
		expect(rollAction(undefined, 0)).toBe('seed');
	});

	it('tumbles when the roll counter moves', () => {
		expect(rollAction(7, 8)).toBe('tumble');
		// …including a resync that moves it by more than one
		expect(rollAction(7, 12)).toBe('tumble');
	});

	it('settles without a show when the face changes but no roll happened', () => {
		// a scenario load, or an edited piece — not an event to replay
		expect(rollAction(7, 7)).toBe('settle');
	});
});

describe('tumbleSpin', () => {
	it('is the same on every client for the same roll', () => {
		const a = tumbleSpin(9, 17);
		const b = tumbleSpin(9, 17);
		expect(a.axisA.toArray()).toEqual(b.axisA.toArray());
		expect(a.axisB.toArray()).toEqual(b.axisB.toArray());
		expect([a.turnsA, a.turnsB]).toEqual([b.turnsA, b.turnsB]);
	});

	it('gives consecutive rolls visibly different flights', () => {
		// otherwise rolling the same number twice looks like nothing happened
		const paths = [1, 2, 3, 4, 5, 6].map((seq) => tumbleSpin(seq, 4).axisA);
		for (let i = 0; i < paths.length; i++) {
			for (let j = i + 1; j < paths.length; j++) {
				expect(paths[i].angleTo(paths[j])).toBeGreaterThan(0.05);
			}
		}
	});

	it('always spins whole turns, and enough of them to read as a tumble', () => {
		for (let seq = 1; seq <= 50; seq++) {
			const spin = tumbleSpin(seq, (seq % 20) + 1);
			expect(Number.isInteger(spin.turnsA)).toBe(true);
			expect(Number.isInteger(spin.turnsB)).toBe(true);
			expect(spin.turnsA).toBeGreaterThanOrEqual(2);
			expect(spin.axisA.length()).toBeCloseTo(1, 10);
			expect(spin.axisB.length()).toBeCloseTo(1, 10);
		}
	});
});

describe('tumbleOrientation', () => {
	it('starts on the old face and lands exactly on the new one', () => {
		for (const sides of DIE_SIDES) {
			for (let value = 1; value <= sides; value++) {
				const from = dieSettleQuaternion(sides, 1);
				const to = dieSettleQuaternion(sides, value);
				const spin = tumbleSpin(value, value);

				expect(angleBetween(tumbleOrientation(from, to, spin, 0), from)).toBeLessThan(EXACT);
				// the whole-turns trick: the spin cancels itself at the end, so the
				// result face is up to the last decimal, not approximately
				expect(angleBetween(tumbleOrientation(from, to, spin, 1), to)).toBeLessThan(EXACT);
			}
		}
	});

	it('actually tumbles in between instead of easing straight over', () => {
		const from = dieSettleQuaternion(20, 1);
		const to = dieSettleQuaternion(20, 14);
		const spin = tumbleSpin(3, 14);

		// somewhere in the middle it must be pointing well away from both ends
		const away = [0.2, 0.35, 0.5, 0.65, 0.8].map((t) => {
			const q = tumbleOrientation(from, to, spin, t);
			return Math.min(angleBetween(q, from), angleBetween(q, to));
		});
		expect(Math.max(...away)).toBeGreaterThan(1);
	});

	it('holds the landing if the spring creeps past 1 instead of over-rotating', () => {
		const from = dieSettleQuaternion(6, 2);
		const to = dieSettleQuaternion(6, 5);
		const spin = tumbleSpin(1, 5);
		// the slerp is clamped; only the (whole-turn) spin keeps going, so a small
		// overshoot stays a small wobble rather than a fraction of a revolution
		expect(angleBetween(tumbleOrientation(from, to, spin, 1.002), to)).toBeLessThan(0.1);
	});

	it('every client replaying the same roll sees the same orientation throughout', () => {
		const path = (t: number) =>
			tumbleOrientation(
				dieSettleQuaternion(10, 3),
				dieSettleQuaternion(10, 8),
				tumbleSpin(12, 8),
				t
			).toArray();
		for (const t of [0, 0.25, 0.5, 0.75, 1]) expect(path(t)).toEqual(path(t));
	});
});
