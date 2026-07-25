import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CAMERA_POSITION_EPSILON,
	CAMERA_STREAM_INTERVAL_MS,
	createCameraStream,
	poseChanged,
	type CameraSample,
	type Vec3
} from '../cameraStream';

const ORIGIN: Vec3 = [0, 0, 0];

describe('poseChanged', () => {
	it('ignores sub-threshold jitter on both endpoints', () => {
		expect(
			poseChanged({ p: [0, 25, 0], t: ORIGIN }, { p: [0.001, 25, 0.001], t: [0, 0, 0.001] })
		).toBe(false);
	});

	it('fires when the eye moves past the position epsilon', () => {
		expect(
			poseChanged(
				{ p: [0, 25, 0], t: ORIGIN },
				{ p: [0, 25, CAMERA_POSITION_EPSILON * 2], t: ORIGIN }
			)
		).toBe(true);
	});

	it('fires when only the orbit target moves (pan)', () => {
		expect(poseChanged({ p: [0, 25, 0], t: ORIGIN }, { p: [0, 25, 0], t: [1, 0, 0] })).toBe(true);
	});
});

describe('createCameraStream', () => {
	let clock = 0;
	let sent: CameraSample[];
	const now = () => clock;

	beforeEach(() => {
		vi.useFakeTimers();
		clock = 10_000;
		sent = [];
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function makeStream(deliver = true) {
		return createCameraStream(
			(sample) => {
				if (!deliver) return false;
				sent.push(sample);
				return true;
			},
			{ now }
		);
	}

	/** advance both the injected clock and the timer queue together */
	function advance(ms: number) {
		clock += ms;
		vi.advanceTimersByTime(ms);
	}

	it('sends the first sample immediately (leading edge)', () => {
		const stream = makeStream();
		stream.offer([0, 25, 0], ORIGIN);
		expect(sent).toEqual([{ p: [0, 25, 0], t: ORIGIN, seq: 1 }]);
	});

	it('sends nothing at all while the camera is idle', () => {
		const stream = makeStream();
		stream.offer([0, 25, 0], ORIGIN);
		sent = [];

		// a settled OrbitControls still fires `change` during damping
		for (let i = 0; i < 100; i++) {
			stream.offer([0, 25, 0.0001], ORIGIN);
			advance(16);
		}
		expect(sent).toEqual([]);
	});

	it('coalesces a burst into one leading and one trailing sample', () => {
		const stream = makeStream();
		for (let i = 0; i < 30; i++) {
			stream.offer([i, 25, 0], ORIGIN);
			advance(16); // ~60 Hz orbit
		}
		stream.dispose();

		// 30 offers over ~480ms → 1 leading + at most 2 more at 350ms spacing
		expect(sent.length).toBeLessThanOrEqual(3);
		expect(sent[0].p).toEqual([0, 25, 0]);
	});

	it('never exceeds the interval budget under sustained orbiting', () => {
		const stream = makeStream();
		const durationMs = 10_000;
		for (let t = 0; t < durationMs; t += 16) {
			stream.offer([t / 100, 25, 0], ORIGIN);
			advance(16);
		}
		stream.dispose();

		const maxSends = Math.ceil(durationMs / CAMERA_STREAM_INTERVAL_MS) + 1;
		expect(sent.length).toBeLessThanOrEqual(maxSends);
		// and comfortably under the server's 7 msg/s disconnect threshold,
		// which drag streaming already spends 5 Hz of
		expect(sent.length / (durationMs / 1000)).toBeLessThanOrEqual(3);
	});

	it('delivers the settled pose as a trailing sample after motion stops', () => {
		const stream = makeStream();
		stream.offer([0, 25, 0], ORIGIN); // leading
		stream.offer([5, 25, 0], ORIGIN); // throttled → queued
		stream.offer([9, 25, 0], ORIGIN); // supersedes the queued one
		expect(sent).toHaveLength(1);

		advance(CAMERA_STREAM_INTERVAL_MS);
		expect(sent).toHaveLength(2);
		expect(sent[1]).toEqual({ p: [9, 25, 0], t: ORIGIN, seq: 2 });
	});

	it('assigns a strictly increasing seq', () => {
		const stream = makeStream();
		for (let i = 0; i < 5; i++) {
			stream.offer([i * 10, 25, 0], ORIGIN);
			advance(CAMERA_STREAM_INTERVAL_MS);
		}
		expect(sent.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5]);
	});

	it('force bypasses the movement gate but not the throttle', () => {
		const stream = makeStream();
		stream.offer([0, 25, 0], ORIGIN);
		expect(sent).toHaveLength(1);

		// same pose, forced: queued rather than sent, so a burst of joiners
		// cannot spend the rate budget
		stream.offer([0, 25, 0], ORIGIN, true);
		expect(sent).toHaveLength(1);

		advance(CAMERA_STREAM_INTERVAL_MS);
		expect(sent).toHaveLength(2);
		expect(sent[1].p).toEqual([0, 25, 0]);
	});

	it('copies the pose so later mutation of the caller vectors cannot leak', () => {
		const stream = makeStream();
		const p: Vec3 = [0, 25, 0];
		stream.offer(p, ORIGIN);
		p[0] = 99;
		expect(sent[0].p).toEqual([0, 25, 0]);
	});

	it('does not consider an undelivered sample sent (socket not up yet)', () => {
		let connected = false;
		const stream = createCameraStream(
			(sample) => {
				if (!connected) return false;
				sent.push(sample);
				return true;
			},
			{ now }
		);

		stream.offer([0, 25, 0], ORIGIN); // dropped: not connected
		expect(sent).toEqual([]);

		// same pose once the socket is up — hysteresis must not swallow it, or a
		// camera that connects and then sits still would never appear to peers
		connected = true;
		advance(CAMERA_STREAM_INTERVAL_MS);
		stream.offer([0, 25, 0], ORIGIN);
		expect(sent).toEqual([{ p: [0, 25, 0], t: ORIGIN, seq: 1 }]);
	});

	it('drops a queued trailing sample on dispose', () => {
		const stream = makeStream();
		stream.offer([0, 25, 0], ORIGIN);
		stream.offer([5, 25, 0], ORIGIN);
		stream.dispose();

		advance(CAMERA_STREAM_INTERVAL_MS * 2);
		expect(sent).toHaveLength(1);
	});
});
