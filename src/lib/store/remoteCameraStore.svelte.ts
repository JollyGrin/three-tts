/**
 * Remote players' camera poses — the receive half of the ephemeral `camera`
 * message (see websocket/cameraStream.ts and SPEC.md §4c).
 *
 * Kept completely out of `gameStore` on purpose: writing presence into game
 * state would echo back onto the wire as an `update` (SPEC.md §161), persist
 * on the server and replay to joiners. Nothing in here is ever sent.
 */

import { writable, get } from 'svelte/store';
import type { CameraSample, Vec3 } from '$lib/websocket/cameraStream';

/** no sample for this long → the avatar starts fading out */
export const CAMERA_STALE_MS = 5_000;
/** how long the fade from full to CAMERA_MIN_OPACITY takes */
export const CAMERA_FADE_MS = 2_500;
/**
 * No sample for this long → the avatar is dropped, *unless* the server says
 * that player is still connected.
 *
 * The issue specified a flat 30s expiry because "the client has no reliable
 * connected flag (#33 is still in review)". #33 has since merged: presence now
 * arrives as `players[id].connected` merge patches. That matters, because the
 * sender goes deliberately silent while a camera is still — under a flat
 * expiry a player who parks their view and thinks for 30s would blink out.
 * So expiry is now the *fallback* for peers we have no presence for, and a
 * `connected: false` patch is the real removal signal.
 */
export const CAMERA_EXPIRE_MS = 30_000;
/** faded-out avatars stay faintly visible until they expire */
export const CAMERA_MIN_OPACITY = 0.15;

/**
 * A peer that reloads restarts its counter at 1. Only reject seqs inside this
 * window below the newest one (genuine reordering); a bigger backwards jump is
 * a restarted stream and must be accepted or that peer never reappears.
 */
export const CAMERA_SEQ_RESET_GAP = 32;

export type RemoteCamera = {
	p: Vec3;
	t: Vec3;
	seq: number;
	/** local clock when the newest accepted sample arrived */
	lastSeen: number;
};

export type RemoteCameraMap = Record<string, RemoteCamera>;

function isVec3(value: unknown): value is Vec3 {
	return (
		Array.isArray(value) &&
		value.length === 3 &&
		value.every((n) => typeof n === 'number' && isFinite(n))
	);
}

/** A wire payload we are willing to render. Anything else is dropped silently. */
export function parseCameraSample(value: unknown): CameraSample | null {
	if (!value || typeof value !== 'object') return null;
	const { p, t, seq } = value as Partial<CameraSample>;
	if (!isVec3(p) || !isVec3(t)) return null;
	if (typeof seq !== 'number' || !isFinite(seq)) return null;
	return { p, t, seq };
}

/**
 * Last-write-wins per player (SPEC.md:181): a sample that is not newer than
 * the one already applied is dropped. Returns the same map object when
 * nothing changed so subscribers don't churn.
 */
export function applyCameraSample(
	map: RemoteCameraMap,
	playerId: string,
	value: unknown,
	receivedAt: number
): RemoteCameraMap {
	if (!playerId) return map;
	const sample = parseCameraSample(value);
	if (!sample) return map;

	const existing = map[playerId];
	if (existing && sample.seq <= existing.seq && sample.seq > existing.seq - CAMERA_SEQ_RESET_GAP)
		return map;

	return {
		...map,
		[playerId]: { p: sample.p, t: sample.t, seq: sample.seq, lastSeen: receivedAt }
	};
}

/** Presence as the lobby state carries it — `players` from a GameDTO. */
export type PresenceRoster = Record<string, { connected?: boolean } | null | undefined>;

/**
 * Drop avatars whose newest sample is older than `expireMs`.
 *
 * `roster` is the server's presence view (#48). Per player:
 *  - `connected === true`  → keep, however stale. They are here, just still.
 *  - `connected === false` → drop now, without waiting out the expiry.
 *  - unknown               → fall back to `expireMs`.
 */
export function pruneExpiredCameras(
	map: RemoteCameraMap,
	now: number,
	expireMs = CAMERA_EXPIRE_MS,
	roster?: PresenceRoster
): RemoteCameraMap {
	const live = Object.entries(map).filter(([id, cam]) => {
		const connected = roster?.[id]?.connected;
		if (connected === true) return true;
		if (connected === false) return false;
		return now - cam.lastSeen < expireMs;
	});
	if (live.length === Object.keys(map).length) return map;
	return Object.fromEntries(live);
}

/** Full → faint over CAMERA_FADE_MS once a sample is CAMERA_STALE_MS old. */
export function cameraOpacity(ageMs: number): number {
	if (ageMs <= CAMERA_STALE_MS) return 1;
	const progress = Math.min(1, (ageMs - CAMERA_STALE_MS) / CAMERA_FADE_MS);
	return 1 - progress * (1 - CAMERA_MIN_OPACITY);
}

/** playerId → newest pose. Never contains our own id (index.ts filters it). */
export const remoteCameraStore = writable<RemoteCameraMap>({});

/**
 * Shared "now" driving the fade. Bumped on every accepted sample and by
 * TableScene's tick, so avatars dim without every component owning a timer.
 */
export const remoteCameraNow = writable(0);

export const remoteCameraActions = {
	/** Apply an inbound `camera` payload. */
	receive(playerId: string, value: unknown, receivedAt: number = Date.now()) {
		const before = get(remoteCameraStore);
		const after = applyCameraSample(before, playerId, value, receivedAt);
		if (after === before) return;
		remoteCameraStore.set(after);
		remoteCameraNow.set(receivedAt);
	},

	/** Age the fade and drop avatars that expired or went offline. */
	tick(now: number = Date.now(), roster?: PresenceRoster) {
		remoteCameraNow.set(now);
		remoteCameraStore.update((map) => pruneExpiredCameras(map, now, CAMERA_EXPIRE_MS, roster));
	},

	forget(playerId: string) {
		remoteCameraStore.update((map) => {
			if (!(playerId in map)) return map;
			return Object.fromEntries(Object.entries(map).filter(([id]) => id !== playerId));
		});
	},

	/** Keep only players present in an authoritative roster. */
	retain(playerIds: string[]) {
		const keep = new Set(playerIds);
		remoteCameraStore.update((map) => {
			const live = Object.entries(map).filter(([id]) => keep.has(id));
			if (live.length === Object.keys(map).length) return map;
			return Object.fromEntries(live);
		});
	},

	reset() {
		remoteCameraStore.set({});
	}
};
