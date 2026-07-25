/**
 * Auto-claim for `?seat=N` invite links: keep trying to claim the seat's
 * placeholder until it actually succeeds, and report failure loudly instead
 * of going quiet.
 *
 * The claim can fail transiently — the scenario hasn't synced yet, or my
 * player id hasn't been created — so every store change (plus a slow poll as
 * a backstop) retries until `claimSeat` returns true. Only then is the claim
 * considered done. On timeout the failure handler gets a reason so the UI
 * can distinguish "someone took your seat" from "no scenario ever arrived".
 */

import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import type { GameDTO } from '$lib/store/game/types';
import { claimSeat, isSeatPlaceholder, seatPlaceholderId, type SeatIndex } from './scenario';

export type AutoClaimFailureReason = 'seat-taken' | 'timed-out';

export type AutoClaimHandlers = {
	onClaimed?: (seat: SeatIndex) => void;
	onFailed?: (seat: SeatIndex, reason: AutoClaimFailureReason) => void;
};

const RETRY_POLL_MS = 500;

/** A deck id `deck:<owner>:<slot>` owned by this player marks a claimed seat. */
function ownsAnyDeck(state: Partial<GameDTO> | undefined, playerId: string): boolean {
	return Object.keys(state?.decks ?? {}).some((key) => key.split(':')[1] === playerId);
}

function failureReason(seat: SeatIndex): AutoClaimFailureReason {
	const s = get(gameStore);
	const myId = gameActions.getMyId() ?? undefined;
	// the placeholder is gone but another player sits at that seat with decks
	// of their own — somebody beat this invite to the seat
	const takenBy = Object.entries(s?.players ?? {}).some(
		([id, player]) =>
			!isSeatPlaceholder(id) && id !== myId && player?.seat === seat && ownsAnyDeck(s, id)
	);
	return takenBy ? 'seat-taken' : 'timed-out';
}

/**
 * Watch the synced state and claim `seatParam`'s placeholder as soon as that
 * succeeds. Returns a cleanup function. No-op for missing/invalid params.
 */
export function startAutoClaim(
	seatParam: string | null,
	handlers: AutoClaimHandlers = {},
	timeoutMs = 20000
): () => void {
	const seat = Number(seatParam) as SeatIndex;
	if (seatParam === null || ![0, 1, 2, 3].includes(seat)) return () => {};

	let done = false;
	let scheduled = false;

	// hoisted: every caller runs from a microtask or timer, by which point the
	// consts below are assigned
	function cleanup() {
		done = true;
		clearTimeout(timer);
		clearInterval(poll);
		unsubscribe();
	}

	function attempt() {
		scheduled = false;
		if (done) return;
		if (!get(gameStore)?.players?.[seatPlaceholderId(seat)]) return; // keep waiting
		if (!claimSeat(seat)) return; // transient failure (e.g. no player id yet) — retry
		cleanup();
		handlers.onClaimed?.(seat);
	}

	// claim outside the store notification cycle, at most one pending attempt
	function scheduleAttempt() {
		if (done || scheduled) return;
		scheduled = true;
		queueMicrotask(attempt);
	}

	// subscribe() invokes the callback synchronously, but that only queues a
	// microtask — so nothing touches `unsubscribe` before it is assigned
	const unsubscribe = gameStore.subscribe(scheduleAttempt);
	// backstop for the placeholder-present-but-claim-failed case when no
	// further store change arrives to re-trigger the subscription
	const poll = setInterval(scheduleAttempt, RETRY_POLL_MS);

	const timer = setTimeout(() => {
		if (done) return;
		const reason = failureReason(seat);
		cleanup();
		handlers.onFailed?.(seat, reason);
	}, timeoutMs);

	return () => {
		if (!done) cleanup();
	};
}
