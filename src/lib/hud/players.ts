/**
 * Derivation for the player HUD: turn a GameDTO snapshot into one row per
 * player at the table.
 *
 * Everything here is read-only and comes from state that already syncs to
 * every client — entity ids encode ownership (`deck:<playerId>:<slot>`,
 * `card:<playerId>:…`), so an opponent's hand size and deck counts are
 * derivable without any new wire messages.
 *
 * Counts are all there is to work with: another player's tray and a facedown
 * deck's card list never reach this client at all, so `handCount`/`cardCount`
 * (server-derived) are the numbers, with the local lengths as the offline
 * fallback for the /setup editor.
 */

import { isSeatPlaceholder } from '$lib/scenario/scenario';
import type { GameDTO } from '$lib/store/game/types';

/** Table rotation each seat index maps to — see `SeatState` in store/game/types.ts */
export const SEAT_ROTATION_DEG: Record<number, number> = {
	0: 0,
	1: 180,
	2: 90,
	3: 270
};

export type DeckCount = {
	/** the `<slot>` part of `deck:<playerId>:<slot>` */
	slot: string;
	count: number;
};

export type PlayerHudRow = {
	/** player id, or the `seat0`–`seat3` placeholder id for an open seat */
	id: string;
	seat: number;
	rotationDeg: number;
	joinTimestamp: number;
	/** this client's own player */
	isMe: boolean;
	/** a `seat0`–`seat3` placeholder — nobody is sitting here yet */
	isOpenSeat: boolean;
	/** number of cards in the tray (hand); counts only, never the cards */
	handCount: number;
	/** decks owned by this player, sorted by slot */
	decks: DeckCount[];
	/** cards owned by this player currently on the table */
	tableCount: number;
};

/** `deck:alice:main` → `alice`; ids without an owner segment return undefined. */
function ownerOf(entityId: string): string | undefined {
	const parts = entityId.split(':');
	return parts.length >= 3 ? parts[1] : undefined;
}

/** `deck:alice:main` → `main`; falls back to the whole id when it is malformed. */
function slotOf(deckId: string): string {
	const parts = deckId.split(':');
	return parts.length >= 3 ? parts.slice(2).join(':') : deckId;
}

function countOwnedBy(ids: string[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const id of ids) {
		const owner = ownerOf(id);
		if (!owner) continue;
		counts[owner] = (counts[owner] ?? 0) + 1;
	}
	return counts;
}

/**
 * One row per player in the lobby, sorted by seat then join time.
 * Placeholder seats (`seat0`–`seat3`) come through as `isOpenSeat` rows.
 */
export function derivePlayerRows(
	state: Partial<GameDTO> | undefined | null,
	myId?: string | null
): PlayerHudRow[] {
	const players = state?.players ?? {};

	const decksByOwner: Record<string, DeckCount[]> = {};
	for (const [deckId, deck] of Object.entries(state?.decks ?? {})) {
		const owner = ownerOf(deckId);
		if (!owner || !deck) continue;
		(decksByOwner[owner] ??= []).push({
			slot: slotOf(deckId),
			count: deck.cardCount ?? deck.cards?.length ?? 0
		});
	}
	for (const decks of Object.values(decksByOwner))
		decks.sort((a, b) => a.slot.localeCompare(b.slot));

	const tableByOwner = countOwnedBy(Object.keys(state?.cards ?? {}));

	return Object.entries(players)
		.filter(([, player]) => !!player)
		.map(([id, player]) => {
			const seat = player?.seat ?? 0;
			return {
				id,
				seat,
				rotationDeg: SEAT_ROTATION_DEG[seat] ?? 0,
				joinTimestamp: player?.joinTimestamp ?? 0,
				isMe: !!myId && id === myId,
				isOpenSeat: isSeatPlaceholder(id),
				handCount: player?.handCount ?? Object.keys(player?.tray ?? {}).length,
				decks: decksByOwner[id] ?? [],
				tableCount: tableByOwner[id] ?? 0
			};
		})
		.sort((a, b) => a.seat - b.seat || a.joinTimestamp - b.joinTimestamp);
}

/** `3 players` / `1 player` — the collapsed header summary. */
export function summarize(rows: PlayerHudRow[]): string {
	const seated = rows.filter((row) => !row.isOpenSeat).length;
	const open = rows.length - seated;
	const players = `${seated} player${seated === 1 ? '' : 's'}`;
	return open > 0 ? `${players} · ${open} open` : players;
}
