/**
 * The intent channel (tableplace-169).
 *
 * The wire carries LWW JSON patches — "card x rotation became 180". That is
 * enough to draw a table and hopeless to reason about: a rules engine, a game
 * log, a replay and an undo stack all want the *verb* ("flipCard"), which today
 * dies at the `gameActions` function boundary. This module keeps the verb alive
 * beside the patch. It limits nothing and knows no rules.
 *
 * How it hangs together:
 *
 *  - `withIntents` wraps every function on the actions bag, so a call puts a
 *    named frame on a stack for the duration of its body;
 *  - `mintIntent()` is called at the patch seam (`gameStore.updateState`, and
 *    ahead of it in the websocket wrapper). It mints AT MOST ONE event per
 *    action call, and only when a patch is actually produced — which is what
 *    keeps the read-only verbs on the bag (`getMe`, `getDeckLength`, …) silent
 *    without needing a list of them anywhere;
 *  - the minted event rides the outgoing patch message under `__intents`
 *    (see `attachIntents`), so the relay's rate limit is not consumed twice and
 *    the Go relay needs no change: `value` is a `json.RawMessage` it rebroadcasts
 *    verbatim;
 *  - `splitIntents` peels it back off on the receiving client, which publishes
 *    it through the same bus its own actions publish through. An observer hooked
 *    to `onIntent` therefore sees the whole table, not only its own half.
 *
 * `seq` is assigned by the client that acted and counts per actor, so an event
 * is identical on every client that sees it — nobody renumbers anything on
 * arrival. `admit()` uses that to drop replays (the relay merges `__intents`
 * into lobby state like any other key, so the last batch comes back in a
 * joiner's `sync` snapshot; see the strip in `websocket/index.ts`).
 */

/**
 * Reserved key the intents ride under, inside a patch message's `value`.
 * Double-underscored because it is NOT game state: every client strips it
 * before the merge, so it never reaches `GameDTO` and never leaves in an export.
 */
export const INTENTS_KEY = '__intents';

export type IntentEvent = {
	/** monotonic per actor, assigned by the client that acted — never renumbered */
	seq: number;
	/**
	 * The acting seat, identified by its player id. The numeric `PlayerDTO.seat`
	 * would not do: it defaults to 0 for everyone until a seat is claimed, and
	 * two actors sharing an identity would collide in `seq`.
	 */
	seat: string;
	/** the `gameActions` verb, or a gesture named explicitly with `withIntent` */
	verb: string;
	/** the call's arguments, JSON-reduced (see `reduceArgs`) */
	args: unknown[];
};

export type IntentListener = (intent: IntentEvent) => void;

/** How much of one argument is worth carrying before it is summarised instead. */
const MAX_ARG_BYTES = 512;

/** Recent intents kept for the dev bridge / a future game log; oldest dropped. */
const LOG_LIMIT = 500;

const listeners = new Set<IntentListener>();
const log: IntentEvent[] = [];

/** highest `seq` admitted per actor — the mint counter and the replay guard in one */
const lastSeq = new Map<string, number>();

/**
 * Subscribe to every intent this client sees, local and remote alike, in the
 * order they were published. Returns the unsubscribe.
 */
export function onIntent(listener: IntentListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Everything published so far, oldest first (capped at `LOG_LIMIT`). */
export function intentLog(): IntentEvent[] {
	return [...log];
}

/** Forget the log. A spec brackets a gesture with this; nothing in the app calls it. */
export function clearIntentLog(): void {
	log.length = 0;
}

function publish(intent: IntentEvent): void {
	log.push(intent);
	if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
	for (const listener of listeners) {
		try {
			listener(intent);
		} catch (error) {
			// an observer that throws must not take the mutation down with it —
			// this channel is a readout, never a gate
			console.error('An intent listener threw:', error);
		}
	}
}

/**
 * Admit an event once. Returns false for anything at or behind what this actor
 * has already been seen doing — a `sync` replay, or a duplicate rebroadcast.
 */
function admit(intent: IntentEvent): boolean {
	if ((lastSeq.get(intent.seat) ?? 0) >= intent.seq) return false;
	lastSeq.set(intent.seat, intent.seq);
	return true;
}

/**
 * The identity the acting client stamps on its own intents — the same id
 * `playerActions.getMe()` resolves from, read straight out of localStorage
 * rather than imported so the intent channel has no cycle back through the
 * actions bag that wraps itself with it.
 */
function actingSeat(): string {
	try {
		return localStorage.getItem('myPlayerId') ?? 'local';
	} catch {
		return 'local';
	}
}

/**
 * One argument, made safe to put on the wire: JSON-reducible values survive
 * as-is, anything bigger than `MAX_ARG_BYTES` is summarised (a 52-card
 * `addDeck` payload is already in the patch — repeating it in the intent would
 * double every deck spawn), and anything unserialisable becomes a marker
 * instead of throwing inside a mutation.
 */
function reduceArg(arg: unknown): unknown {
	let json: string | undefined;
	try {
		json = JSON.stringify(arg);
	} catch {
		return { elided: true };
	}
	if (json === undefined) return null; // functions, undefined
	if (json.length > MAX_ARG_BYTES) return { elided: true, bytes: json.length };
	return JSON.parse(json);
}

function reduceArgs(args: unknown[]): unknown[] {
	return args.map(reduceArg);
}

type Frame = { verb: string; args: unknown[]; minted: IntentEvent | null };

/**
 * The verbs currently executing. Nested `gameActions` calls (deck.ts reaches
 * back through the bag) push their own frame, but only frame 0 is ever minted:
 * the outermost verb is the one the player asked for.
 */
const frames: Frame[] = [];

/**
 * Name what a function does, for the intent channel. Wrapping is inert until
 * the body actually patches state — see `mintIntent`.
 */
export function withIntent<F extends (...args: never[]) => unknown>(verb: string, fn: F): F {
	return function (this: unknown, ...args: Parameters<F>) {
		frames.push({ verb, args, minted: null });
		try {
			return fn.apply(this, args);
		} finally {
			frames.pop();
		}
	} as F;
}

/** `withIntent` across a whole actions bag, keyed by each function's own name. */
export function withIntents<T extends Record<string, unknown>>(actions: T): T {
	const named: Record<string, unknown> = {};
	for (const [verb, value] of Object.entries(actions)) {
		named[verb] =
			typeof value === 'function'
				? withIntent(verb, value as (...args: never[]) => unknown)
				: value;
	}
	return named as T;
}

/**
 * Mint the event for the action currently running, or null when there is no
 * verb in scope (a raw `gameStore.updateState` — the per-frame drag stream, a
 * scenario load) or when this action has already minted one.
 *
 * Idempotent on purpose: the websocket wrapper mints first so the event can
 * ride the outgoing message, and the store's own call then finds it done.
 */
export function mintIntent(): IntentEvent | null {
	const frame = frames[0];
	if (!frame || frame.minted) return null;

	const seat = actingSeat();
	const seq = (lastSeq.get(seat) ?? 0) + 1;
	lastSeq.set(seat, seq);

	const intent: IntentEvent = { seq, seat, verb: frame.verb, args: reduceArgs(frame.args) };
	frame.minted = intent;
	publish(intent);
	return intent;
}

/** A patch value with intents riding along, or the value untouched when there are none. */
export function attachIntents<T extends object>(value: T, intents: IntentEvent[]): T {
	if (!intents.length) return value;
	return { ...value, [INTENTS_KEY]: intents };
}

function isIntent(candidate: unknown): candidate is IntentEvent {
	const intent = candidate as Partial<IntentEvent> | null;
	return (
		!!intent &&
		typeof intent === 'object' &&
		typeof intent.seq === 'number' &&
		typeof intent.seat === 'string' &&
		typeof intent.verb === 'string' &&
		Array.isArray(intent.args)
	);
}

/**
 * Peel the intents off an inbound patch. The state half is what gets merged —
 * `__intents` must never reach the store, or it would show up in a scenario
 * export and be re-broadcast forever.
 */
export function splitIntents<T>(update: T): { state: T; intents: IntentEvent[] } {
	if (!update || typeof update !== 'object' || !(INTENTS_KEY in update))
		return { state: update, intents: [] };
	const { [INTENTS_KEY]: carried, ...state } = update as Record<string, unknown>;
	const intents = Array.isArray(carried) ? carried.filter(isIntent) : [];
	return { state: state as T, intents };
}

/** The state half of `splitIntents`, for callers that want the intents dropped. */
export function withoutIntents<T>(update: T): T {
	return splitIntents(update).state;
}

/** Publish intents that arrived from another client, skipping anything already seen. */
export function receiveIntents(intents: IntentEvent[]): void {
	for (const intent of intents) if (admit(intent)) publish(intent);
}
