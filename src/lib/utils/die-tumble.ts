/**
 * The roll animation's arithmetic, kept out of Die.svelte so the two things
 * that have to be exactly right can be tested without a renderer:
 *
 *  - the tumble ends on precisely the orientation the result calls for. A
 *    spin that is a hair short leaves the die reading a different face than
 *    the number the whole lobby agreed on.
 *  - a client seeing a die for the first time does not replay a roll that
 *    happened before it arrived.
 */

import * as THREE from 'three';

const TAU = Math.PI * 2;

export type DieSpin = {
	axisA: THREE.Vector3;
	axisB: THREE.Vector3;
	/** whole turns, so the spin is the identity again when the tumble lands */
	turnsA: number;
	turnsB: number;
};

/** 32-bit avalanche — small, stateless, and identical on every client */
function hash(a: number, b: number): number {
	let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 1, 0xc2b2ae35);
	h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
	h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
	return (h ^ (h >>> 16)) >>> 0;
}

/** an evenly distributed unit axis from 32 bits */
function axisFrom(h: number): THREE.Vector3 {
	const y = ((h & 0xffff) / 0xffff) * 2 - 1;
	const phi = (((h >>> 16) & 0xffff) / 0xffff) * TAU;
	const radius = Math.sqrt(Math.max(0, 1 - y * y));
	return new THREE.Vector3(radius * Math.cos(phi), y, radius * Math.sin(phi));
}

/**
 * The flight path for one roll, derived from `(rollSeq, value)` alone — the two
 * numbers every client receives — so everyone watching sees the same dice fly
 * the same way, not merely the same number at the end.
 */
export function tumbleSpin(rollSeq: number, value: number): DieSpin {
	const h = hash(rollSeq, value);
	return {
		axisA: axisFrom(h),
		axisB: axisFrom(hash(h, rollSeq)),
		turnsA: 2 + (h % 2),
		turnsB: 1 + ((h >>> 5) % 2)
	};
}

/**
 * Where the die is pointing `t` of the way through the tumble.
 *
 * The extra spin is a whole number of turns about each axis scaled by `t`, so
 * at `t = 1` both are the identity and what is left is exactly `to`. That is
 * what lets a spring drive `t` without the landing drifting off the face — and
 * it is why `t` must not overshoot: past 1 the spin is not a small overshoot
 * but a fraction of another revolution.
 */
export function tumbleOrientation(
	from: THREE.Quaternion,
	to: THREE.Quaternion,
	spin: DieSpin,
	t: number
): THREE.Quaternion {
	const orientation = new THREE.Quaternion().slerpQuaternions(
		from,
		to,
		Math.min(1, Math.max(0, t))
	);
	orientation.premultiply(
		new THREE.Quaternion().setFromAxisAngle(spin.axisA, spin.turnsA * TAU * t)
	);
	orientation.premultiply(
		new THREE.Quaternion().setFromAxisAngle(spin.axisB, spin.turnsB * TAU * t)
	);
	return orientation;
}

/**
 * What a client should do about the die state it just received.
 *
 * `seed` — we have never seen this die. Whatever it reads is table state, not
 * an event: adopt the face silently. This is what keeps a player who joins
 * after a roll from watching a replay of it (and, on a busy table, from
 * watching every die in the lobby roll itself at once on connect).
 *
 * `tumble` — the roll counter moved, so a roll happened. Play it.
 *
 * `settle` — the face changed with no roll behind it (a scenario load, an
 * edited piece). Land on it without the show.
 */
export function rollAction(
	seenSeq: number | undefined,
	incomingSeq: number
): 'seed' | 'tumble' | 'settle' {
	if (seenSeq === undefined) return 'seed';
	return incomingSeq === seenSeq ? 'settle' : 'tumble';
}
