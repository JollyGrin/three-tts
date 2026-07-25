/**
 * Outbound camera-pose stream — the first consumer of the ephemeral message
 * tier sketched in SPEC.md §4c.
 *
 * Deliberately NOT routed through `gameStore.updateState`:
 *  - that wrapper only throttles `position` under `cards`/`pieces`, so a pose
 *    would take the immediate branch and fire at pointer-move rate, and
 *  - it sends `type:'update'`, which the server merges into the lobby's
 *    canonical state — poses would be persisted, inflate the `/view` state
 *    size and replay to every joiner.
 *
 * `type:'camera'` instead falls through the server's switch untouched and is
 * relayed to every peer but the sender (server/game/game.go) — pure relay,
 * never persisted, never in a `sync` snapshot.
 *
 * Budget: the server *disconnects* (it does not drop) at 7 msg/s sustained
 * with a burst bucket of 15 (server/lobby/lobby.go). Drag streaming already
 * owns 5 Hz of that, so the camera gets ≤ 3 Hz — leading edge plus one
 * trailing sample — and goes completely silent once the camera settles.
 */

export type Vec3 = [number, number, number];

/** Wire payload of a `type:'camera'` message. ~60 bytes. */
export type CameraSample = {
	/** camera position */
	p: Vec3;
	/** orbit target the camera is looking at */
	t: Vec3;
	/** monotonic per-sender counter; receivers drop anything not newer */
	seq: number;
};

/** ~2.9 Hz — see the rate budget above. */
export const CAMERA_STREAM_INTERVAL_MS = 350;
/** world units the eye must travel before a new sample is worth sending */
export const CAMERA_POSITION_EPSILON = 0.04;
/** the target moves far less than the eye during an orbit, so it gets a tighter gate */
export const CAMERA_TARGET_EPSILON = 0.02;

type Pose = { p: Vec3; t: Vec3 };

function distance(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Hysteresis gate: has the pose moved enough to be worth a packet?
 * A camera nobody is touching returns false forever, which is what keeps an
 * idle client completely off the wire.
 */
export function poseChanged(
	previous: Pose,
	next: Pose,
	positionEpsilon = CAMERA_POSITION_EPSILON,
	targetEpsilon = CAMERA_TARGET_EPSILON
): boolean {
	return (
		distance(previous.p, next.p) > positionEpsilon || distance(previous.t, next.t) > targetEpsilon
	);
}

export type CameraStream = {
	/**
	 * Offer the current pose. Sends at most once per interval, and only when
	 * the pose actually moved.
	 * @param force skip the movement gate (still throttled) — used to answer a
	 * peer joining, so they get an avatar without waiting for us to orbit.
	 */
	offer(p: Vec3, t: Vec3, force?: boolean): void;
	/** cancel any queued trailing sample */
	dispose(): void;
};

export type CameraStreamOptions = {
	intervalMs?: number;
	positionEpsilon?: number;
	targetEpsilon?: number;
	/** injectable clock, for tests */
	now?: () => number;
};

/**
 * @param send delivers a sample; return `false` when it could not go out (not
 * connected yet) so the stream neither burns a seq nor records the pose as
 * already sent — otherwise hysteresis would suppress it forever and peers
 * would never see a camera that connected and then sat still.
 */
export function createCameraStream(
	send: (sample: CameraSample) => boolean | void,
	options: CameraStreamOptions = {}
): CameraStream {
	const intervalMs = options.intervalMs ?? CAMERA_STREAM_INTERVAL_MS;
	const positionEpsilon = options.positionEpsilon ?? CAMERA_POSITION_EPSILON;
	const targetEpsilon = options.targetEpsilon ?? CAMERA_TARGET_EPSILON;
	const now = options.now ?? Date.now;

	let seq = 0;
	let lastSent: Pose | null = null;
	let lastSentAt = Number.NEGATIVE_INFINITY;
	let pending: Pose | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function emit(pose: Pose) {
		if (send({ p: pose.p, t: pose.t, seq: seq + 1 }) === false) return;
		seq += 1;
		lastSent = pose;
		lastSentAt = now();
	}

	function flushPending() {
		timer = null;
		if (!pending) return;
		const pose = pending;
		pending = null;
		emit(pose);
	}

	return {
		offer(p, t, force = false) {
			const pose: Pose = { p: [p[0], p[1], p[2]], t: [t[0], t[1], t[2]] };

			// compare against the newest pose already committed to the wire (or
			// queued for it), so a settled camera stops sending entirely
			const reference = pending ?? lastSent;
			if (!force && reference && !poseChanged(reference, pose, positionEpsilon, targetEpsilon))
				return;

			const elapsed = now() - lastSentAt;
			if (!timer && elapsed >= intervalMs) {
				emit(pose); // leading edge
				return;
			}
			// trailing: keep only the newest pose — unlike entity updates there is
			// nothing to coalesce, the latest pose supersedes every earlier one
			pending = pose;
			if (!timer) timer = setTimeout(flushPending, Math.max(0, intervalMs - elapsed));
		},

		dispose() {
			if (timer) clearTimeout(timer);
			timer = null;
			pending = null;
		}
	};
}
