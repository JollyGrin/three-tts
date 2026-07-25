/**
 * Invite links: a shared URL that drops the joiner into a lobby and (when it
 * carries `seat=N`) auto-claims that seat's placeholder so its decks become
 * theirs. Kept free of Svelte imports so URL building is unit-testable.
 */

import type { SeatIndex } from './scenario';

/**
 * The seat an invite should target: the first open seat that isn't mine,
 * falling back to any open seat. Undefined when nothing is open.
 */
export function pickInviteSeat(
	openSeats: SeatIndex[],
	mySeat: number | undefined
): SeatIndex | undefined {
	return openSeats.find((s) => s !== mySeat) ?? openSeats[0];
}

/**
 * Absolute lobby URL — chat clients only linkify schemed URLs, so this must
 * start from `page.url.origin` (`https://…`), never `page.url.host`.
 */
export function buildInviteUrl(opts: {
	origin: string;
	server: string;
	lobby: string;
	seat?: SeatIndex;
}): string {
	const params = new URLSearchParams({ server: opts.server, lobby: opts.lobby });
	if (opts.seat !== undefined) params.set('seat', String(opts.seat));
	return `${opts.origin}/play?${params.toString()}`;
}
