import type { GameDTO } from '$lib/store/game/types';
import { prewarmSheetRef } from './resolve.svelte';

function collectRefs(state: Partial<GameDTO> | undefined): string[] {
	if (!state) return [];
	const refs: string[] = [];
	const push = (value?: string | null) => {
		if (value?.startsWith('sheet:')) refs.push(value);
	};

	for (const card of Object.values(state.cards ?? {})) {
		push(card?.faceImageUrl);
		push(card?.backImageUrl);
	}
	for (const deck of Object.values(state.decks ?? {})) {
		push(deck?.deckBackImageUrl);
		for (const card of deck?.cards ?? []) {
			push(card?.faceImageUrl);
			push(card?.backImageUrl);
		}
	}
	for (const piece of Object.values(state.pieces ?? {})) {
		push(piece?.imageUrl);
		// every state, not just the current one: cycling must not wait on a fetch
		for (const pieceState of piece?.states ?? []) push(pieceState?.face);
	}
	for (const player of Object.values(state.players ?? {})) {
		for (const card of Object.values(player?.tray ?? {})) {
			push(card?.faceImageUrl);
			push(card?.backImageUrl);
		}
	}
	return [...new Set(refs)];
}

/**
 * Resolve every sheet ref present in a (synced) game state, then invoke
 * the callback once all slices are committed. Used on incoming syncs so
 * a re-render sweep can repaint everything deterministically — no
 * reliance on per-component reactive healing.
 */
export async function prewarmGameState(
	state: Partial<GameDTO> | undefined,
	onWarm?: (report: { total: number; failed: number }) => void
): Promise<void> {
	const refs = collectRefs(state);
	if (refs.length === 0) return;
	console.log(`[prewarm] resolving ${refs.length} sheet refs…`);
	const results = await Promise.allSettled(refs.map((ref) => prewarmSheetRef(ref)));
	const failed = results.filter(
		(r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === '')
	).length;
	console.log(`[prewarm] done: ${refs.length - failed}/${refs.length} resolved`);
	onWarm?.({ total: refs.length, failed });
}
