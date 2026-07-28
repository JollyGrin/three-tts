import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { driveSpring, framesAreStalling, noteFrame, resetFrameStalls } from '../frame-stall.svelte';

/**
 * The rule these pin down: a starved frame loop turns every positional spring
 * into a teleport, because a spring that cannot be integrated smoothly is not
 * smoothing anything — it is only drawing entities where they are not, which is
 * what let a press meant for a token grab the tile underneath it (#157/#159).
 */

/** the shape driveSpring actually needs from svelte's Spring */
function fakeSpring(value: number) {
	return {
		target: value,
		current: value,
		instantSets: 0,
		set(next: number, options?: { instant?: boolean }) {
			if (options?.instant) {
				this.instantSets++;
				this.current = next;
			}
			this.target = next;
			return Promise.resolve();
		}
	};
}

describe('frame-stall', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetFrameStalls();
	});
	afterEach(() => {
		resetFrameStalls();
		vi.useRealTimers();
	});

	it('treats an ordinary frame rate as healthy', () => {
		for (let frame = 0; frame < 30; frame++) noteFrame(frame * 16.7);
		expect(framesAreStalling()).toBe(false);
	});

	it('is not fooled by a 20fps client — that is slow, not stalled', () => {
		for (let frame = 0; frame < 20; frame++) noteFrame(frame * 50);
		expect(framesAreStalling()).toBe(false);
	});

	it('calls one long gap a stall', () => {
		noteFrame(0);
		noteFrame(16);
		noteFrame(900); // the shader-recompile storm, or a backgrounded tab
		expect(framesAreStalling()).toBe(true);
	});

	it('ignores the very first frame, which has no gap to measure', () => {
		noteFrame(9_999_999);
		expect(framesAreStalling()).toBe(false);
	});

	it('keeps smoothing off until frames have stayed healthy for a while', () => {
		noteFrame(0);
		noteFrame(900);
		expect(framesAreStalling()).toBe(true);

		vi.advanceTimersByTime(500);
		expect(framesAreStalling()).toBe(true); // a storm's next gap is still coming

		vi.advanceTimersByTime(600);
		expect(framesAreStalling()).toBe(false);
	});

	it('re-arms recovery on every fresh stall, so a storm never flickers back', () => {
		noteFrame(0);
		noteFrame(900);
		vi.advanceTimersByTime(800);
		noteFrame(2000); // another long one, just before recovery would have fired
		vi.advanceTimersByTime(500);
		expect(framesAreStalling()).toBe(true);
	});

	it('springs smoothly while frames are healthy', () => {
		const spring = fakeSpring(0);
		driveSpring(spring, 5);
		expect(spring.target).toBe(5);
		expect(spring.instantSets).toBe(0);
	});

	it('snaps to the target while frames are stalling', () => {
		noteFrame(0);
		noteFrame(900);
		const spring = fakeSpring(0);
		driveSpring(spring, 5);
		expect(spring.instantSets).toBe(1);
		expect(spring.current).toBe(5);
	});

	it('honours an explicit instant even when frames are fine — a local drag', () => {
		const spring = fakeSpring(0);
		driveSpring(spring, 5, true);
		expect(spring.instantSets).toBe(1);
	});
});
