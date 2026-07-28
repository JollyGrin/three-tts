/**
 * Frame-loop health — and the one thing the table does about it.
 *
 * Every entity on the table is drawn through springs: the store holds where a
 * card/deck/piece IS, the spring holds where it is currently DRAWN, and the
 * two agree a few hundred milliseconds after any move. That gap is the whole
 * point of the springs (a remote drag arrives at 5 Hz and would otherwise
 * teleport), and it is harmless as long as frames are cheap.
 *
 * It stops being harmless when frames are not. A pointer press aims at where
 * an entity is DRAWN and is dispatched against wherever the scene has got to
 * when the main thread frees up; svelte's springs clamp their own integration
 * to 1/30s per tick, so on a page running at 3 fps they advance in *slow
 * motion* — an entity can still be visibly airborne seconds after it landed in
 * the store, and a press aimed at it lands somewhere else entirely. That is
 * the queued-pointer race behind #157/#159: a press meant for a token grabbed
 * the raised tile underneath it and dragged the tile away.
 *
 * So: when frames stop arriving, stop animating. A spring that cannot be
 * integrated smoothly is not smoothing anything — it is only lying about where
 * things are. Snapping to the store position costs a little polish in exactly
 * the conditions where there was no polish to be had (a starved GPU, a
 * throttled background tab, a shader-recompile storm) and buys back the one
 * invariant that matters for input: what you see is what you can grab.
 *
 * Frames are watched here rather than through Threlte's task scheduler because
 * this is about the *browser's* animation frames — the same clock svelte's
 * springs integrate on — and it must keep answering even when the render loop
 * is the thing that stopped. A hidden tab, whose rAF is suspended entirely,
 * comes back with one enormous gap and is caught by the same rule.
 */

/** a frame gap past this is not a frame rate any more, it is a stall */
const STALL_MS = 120;

/**
 * How long after the last long frame smoothing stays off. Long enough to span
 * the gaps *between* stalls in a storm (a runner that produced one 400ms frame
 * is about to produce another), short enough that a single hiccup doesn't cost
 * a second of animation.
 */
const RECOVERY_MS = 900;

let stalling = $state(false);
let recovery: ReturnType<typeof setTimeout> | null = null;
let watchers = 0;
let loop = 0;
/** -1 until the first frame: a rAF timestamp of 0 is a real timestamp */
let previousFrame = -1;

/**
 * Whether the frame loop is currently too starved to animate through.
 *
 * Reactive: reading this inside an effect re-runs that effect when a stall
 * starts, which is what lets a spring already in flight snap to its target
 * instead of finishing its descent in slow motion under a press.
 */
export function framesAreStalling(): boolean {
	return stalling;
}

/**
 * Feed the watcher a frame timestamp. Exported for the unit tests, which have
 * no rAF to drive it with; the app calls it from `watchFrameStalls`.
 */
export function noteFrame(now: number): void {
	const first = previousFrame < 0;
	const gap = now - previousFrame;
	previousFrame = now;
	if (first || gap <= STALL_MS) return;
	stalling = true;
	if (recovery) clearTimeout(recovery);
	recovery = setTimeout(() => {
		recovery = null;
		stalling = false;
	}, RECOVERY_MS);
}

/**
 * Start watching animation frames; returns the stop function. Reference
 * counted, so two scenes mounting at once share one rAF loop and the last one
 * to leave turns it off.
 */
export function watchFrameStalls(): () => void {
	watchers++;
	if (watchers === 1) {
		previousFrame = -1;
		const tick = (now: number) => {
			loop = requestAnimationFrame(tick);
			noteFrame(now);
		};
		loop = requestAnimationFrame(tick);
	}
	let stopped = false;
	return () => {
		if (stopped) return;
		stopped = true;
		watchers--;
		if (watchers > 0) return;
		cancelAnimationFrame(loop);
		loop = 0;
		resetFrameStalls();
	};
}

/**
 * Point a spring at `value` — smoothly when frames allow it, instantly when
 * they do not (or when the caller already wanted it instant, as a local drag
 * does: a spring between the pointer and the thing it is holding reads as
 * input lag).
 *
 * Every entity that is drawn through a spring AND can be pointed at goes
 * through here, because "drawn where the store says" is what makes a press
 * land on the thing it was aimed at. Purely decorative springs — a counter's
 * value pulse, a deck's shuffle wiggle — deliberately do not: they move
 * nothing a pointer can miss.
 */
export function driveSpring<T>(
	spring: { set: (value: T, options?: { instant?: boolean }) => unknown; target: T },
	value: T,
	instant = false
): void {
	if (instant || framesAreStalling()) spring.set(value, { instant: true });
	else spring.target = value;
}

/** Drop all stall state — unmount, and the unit tests' `beforeEach`. */
export function resetFrameStalls(): void {
	if (recovery) clearTimeout(recovery);
	recovery = null;
	stalling = false;
	previousFrame = -1;
}
