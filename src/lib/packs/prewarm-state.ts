import type { GameDTO } from '$lib/store/game/types';
import { prewarmSheetRef } from './resolve.svelte';
import { ensureModelCatalog } from '$lib/models/catalog-store';
import { prewarmModelRef } from '$lib/models/loader';

function collectRefs(state: Partial<GameDTO> | undefined): string[] {
	if (!state) return [];
	const refs: string[] = [];
	// the two async schemes: sheets slice, models fetch GLBs — both are warmed
	// so an incoming sync paints deterministically instead of healing piecemeal
	const push = (value?: string | null) => {
		if (value?.startsWith('sheet:') || value?.startsWith('model:')) refs.push(value);
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
		push(piece?.model);
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
	console.log(`[prewarm] resolving ${refs.length} sheet/model refs…`);
	const catalog = refs.some((ref) => ref.startsWith('model:')) ? await ensureModelCatalog() : null;
	const results = await Promise.allSettled(
		refs.map((ref) =>
			ref.startsWith('model:') ? prewarmModelRef(catalog, ref) : prewarmSheetRef(ref)
		)
	);
	const failed = results.filter(
		(r) =>
			r.status === 'rejected' || (r.status === 'fulfilled' && (r.value === '' || r.value === false))
	).length;
	console.log(`[prewarm] done: ${refs.length - failed}/${refs.length} resolved`);
	onWarm?.({ total: refs.length, failed });
}
