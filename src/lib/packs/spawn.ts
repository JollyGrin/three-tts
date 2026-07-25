import { get } from 'svelte/store';
import { gameActions } from '$lib/store/game/actions';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { PIECE_REST_Y } from '$lib/utils/constants-pieces';
import { BUILTIN_PACKS, PACK_SOURCE_BUILTIN } from './builtin';
import { hasLibraryPack, PACK_SOURCE_LOCAL } from './library';
import type { SpreadTile } from './spread';
import type { GamePackDef, PackDeckDef, PackPieceDef } from './types';
import type { BagItem, CardDTO, PackOrigin } from '$lib/store/game/types';

export type SpawnPackOptions = {
	/** entity owner — defaults to the local player (the scenario editor passes `seat0`…`seat3`) */
	ownerId?: string;
	/**
	 * where this pack re-resolves from ('builtin' | 'local' | URL); auto-detected
	 * for builtin packs and for packs held in this browser's library
	 */
	source?: string;
};

type Vec3 = [number, number, number];

export type SpawnDeckOptions = SpawnPackOptions & {
	position?: Vec3;
	rotation?: Vec3;
	isFaceUp?: boolean;
	/**
	 * Explicit card order as pack card codes (deck-array order). Unknown codes
	 * are skipped with a warning; omitted = the pack's declaration order.
	 */
	order?: string[];
	/**
	 * Explicit shuffle opt-in. Scenario loads pass the placement's
	 * `shuffleOnLoad`; plain spawns pass `!isFaceUp` to keep the historical
	 * "facedown decks spawn shuffled" behavior.
	 */
	shuffle?: boolean;
	/** re-save authoring intent: stamped onto the deck so export round-trips it */
	shuffleOnLoad?: boolean;
	/** sideways slot when a pack spawns several decks */
	index?: number;
};

/**
 * Seat of the acting owner — placeholder ids (`seat0`…`seat3`) matched by
 * shape to avoid importing scenario.ts (which imports this package).
 */
function ownerSeat(ownerId: string): number {
	const placeholder = /^seat([0-3])$/.exec(ownerId);
	if (placeholder) return Number(placeholder[1]);
	return get(gameStore)?.players?.[ownerId]?.seat ?? 0;
}

/**
 * Where a scenario should look for this pack again. Builtins re-resolve from
 * the shipped registry; anything in the local library re-resolves from there,
 * which is what makes a pack imported from disk survive a scenario save/load
 * without being hosted anywhere. A pack that is in neither gets no stamp — a
 * scenario referencing it will fail loudly by id rather than silently.
 */
function packSource(pack: GamePackDef, source?: string): string | undefined {
	if (source) return source;
	if (BUILTIN_PACKS[pack.id]) return PACK_SOURCE_BUILTIN;
	return hasLibraryPack(pack.id) ? PACK_SOURCE_LOCAL : undefined;
}

function origin(pack: GamePackDef, content: string, source?: string): PackOrigin {
	const resolved = packSource(pack, source);
	return { pack: pack.id, content, ...(resolved ? { source: resolved } : {}) };
}

/** Mirrors addDeck's two-seat defaults, but keyed off the OWNER's seat. */
function deckDefaults(seat: number, index: number, isFaceUp: boolean) {
	const x = 8.5 + (isFaceUp ? 2 : 0) + index * 2.5;
	return seat % 2 === 1
		? { position: [x, 0.4, -4.7] as Vec3, rotation: [0, Math.PI, 0] as Vec3 }
		: { position: [x, 0.4, 4.5] as Vec3, rotation: [0, 0, 0] as Vec3 };
}

/**
 * Spawn one of a pack's decks. Instantiates cards into the gameStore in an
 * explicit order — order and shuffling are the CALLER's choice (tbps v2
 * placements preserve authored order; shuffling is opt-in), never implied.
 */
export function spawnPackDeck(pack: GamePackDef, deck: PackDeckDef, opts: SpawnDeckOptions = {}) {
	const ownerId = opts.ownerId ?? gameActions.getMyId();
	if (!ownerId) return console.error('Cannot spawn a deck without an owner id');

	const defs = opts.order
		? opts.order
				.map((code) => {
					const def = deck.cards.find((c) => c.code === code);
					if (!def)
						console.warn(`[spawnPackDeck] unknown card code '${code}' in ${pack.id}/${deck.slot}`);
					return def;
				})
				.filter((def) => def !== undefined)
		: deck.cards;

	let cards = defs.map((card) => ({
		id: `card:${ownerId}:${deck.slot}-${card.code}`,
		faceImageUrl: card.face,
		backImageUrl: deck.back
	}));
	if (opts.shuffle) cards = gameActions.shuffleCards(cards) ?? cards;

	const isFaceUp = opts.isFaceUp ?? deck.isFaceUp ?? false;
	const defaults = deckDefaults(ownerSeat(ownerId), opts.index ?? 0, isFaceUp);
	const deckId = `deck:${ownerId}:${deck.slot}`;
	// written directly rather than via addDeck: that helper derives id, seat and
	// position from the LOCAL player, but a pack spawns for an arbitrary owner
	// (a `seatN` placeholder in the scenario editor). One update per deck keeps
	// each card list under the server's websocket read limit.
	gameStore.updateState({
		decks: {
			[deckId]: {
				id: deckId,
				isFaceUp,
				deckBackImageUrl: deck.back,
				cards,
				position: opts.position ?? defaults.position,
				rotation: opts.rotation ?? defaults.rotation,
				packOrigin: origin(pack, deck.slot, opts.source),
				...(opts.shuffleOnLoad !== undefined ? { shuffleOnLoad: opts.shuffleOnLoad } : {})
			}
		}
	});
}

export type SpawnDeckSpreadOptions = SpawnPackOptions & {
	/** where each card lands — `spreadLayout(pack.decks)[deckIndex]` */
	tiles: SpreadTile[];
};

/**
 * Spawn one of a pack's decks as loose, face-up cards on a grid instead of a
 * pile — the /create preview's Spread mode.
 *
 * Same card ids as `spawnPackDeck`, so `clearPreview`'s `:preview:` sweep
 * keeps working and a spread respawn replaces exactly what the last one put
 * down. Face-up regardless of the deck's `isFaceUp`: the point of a spread is
 * to see the faces, and `isFaceUp` stays the durable start-face for play.
 * Positions come from the caller because the grid is a function of the WHOLE
 * pack (decks stack into blocks), not of one deck. No `packOrigin` either:
 * a loose CardDTO has nowhere to carry it, and a spread is inspection only.
 *
 * Returns the card ids it wrote, in tile order, so a caller can map a card on
 * the table back to the tile (and the pack card) it came from.
 */
export function spawnPackDeckSpread(deck: PackDeckDef, opts: SpawnDeckSpreadOptions): string[] {
	const ownerId = opts.ownerId ?? gameActions.getMyId();
	if (!ownerId) {
		console.error('Cannot spawn a spread without an owner id');
		return [];
	}

	const ids: string[] = [];
	const cards: Record<string, Partial<CardDTO>> = {};
	for (const tile of opts.tiles) {
		const id = `card:${ownerId}:${deck.slot}-${tile.card.code}`;
		ids.push(id);
		cards[id] = {
			faceImageUrl: tile.card.face,
			...(deck.back ? { backImageUrl: deck.back } : {}),
			position: tile.position,
			rotation: [0, 0, 0]
		};
	}
	// one update per deck, matching spawnPackDeck: keeps each patch small
	if (ids.length) gameStore.updateState({ cards });
	return ids;
}

export type SpawnPieceOptions = SpawnPackOptions & {
	position?: Vec3;
	rotation?: Vec3;
	value?: number;
	/** multi-state pieces: which authored state to start on (default 0) */
	state?: number;
};

/**
 * A pack bag item and a live bag item are the same shape by design — the pack
 * says what is in the bag, the store holds that same list as the bag's state.
 * Cloned per spawn so two bags from one pack never share an array.
 */
function bagContents(def: PackPieceDef): BagItem[] {
	return (def.contents ?? []).map((item) => ({ ...item }) as BagItem);
}

/** Spawn one of a pack's pieces (by index into `pack.pieces`). */
export function spawnPackPiece(pack: GamePackDef, index: number, opts: SpawnPieceOptions = {}) {
	const def = pack.pieces?.[index];
	if (!def) return console.error(`[spawnPackPiece] ${pack.id} has no piece[${index}]`);
	const ownerId = opts.ownerId ?? gameActions.getMyId();
	if (!ownerId) return console.error('Cannot spawn a piece without an owner id');

	// pack piece positions are authored for seat 0; mirror for the far side
	const m = ownerSeat(ownerId) % 2 === 1 ? -1 : 1;
	gameActions.addPiece(def.kind, {
		ownerId,
		name: def.name,
		color: def.color,
		// states[0] IS the base face (see PackPieceDef.states), so a piece that
		// declares states never falls back to imageUrl
		imageUrl: def.states?.length ? def.states[0].face : def.imageUrl,
		states: def.states,
		// the placement's choice wins over the pack's own default
		state: opts.state ?? def.state,
		radius: def.radius,
		maxValue: def.maxValue,
		sides: def.sides,
		value: opts.value,
		...(def.kind === 'bag'
			? { contents: bagContents(def), drawMode: def.drawMode, infinite: def.infinite }
			: {}),
		position: opts.position ?? [def.position[0] * m, PIECE_REST_Y, def.position[1] * m],
		rotation: opts.rotation,
		packOrigin: origin(pack, String(index), opts.source)
	});
}

export type SpawnOverlayOptions = SpawnPackOptions & {
	position?: Vec3;
	rotation?: Vec3;
	scale?: number;
};

/** Spawn one of a pack's overlays (by index into `pack.overlays`). */
export function spawnPackOverlay(pack: GamePackDef, index: number, opts: SpawnOverlayOptions = {}) {
	const def = pack.overlays?.[index];
	if (!def) return console.error(`[spawnPackOverlay] ${pack.id} has no overlay[${index}]`);
	// overlays are table-scoped (claimSeat never renames them) — key by pack
	const id = `overlay:${pack.id}:${index}`;
	gameStore.updateState({
		overlays: {
			[id]: {
				id,
				imageUrl: def.imageUrl,
				ratio: def.ratio,
				scale: opts.scale ?? def.scale,
				position: opts.position ?? [0, 0.255, 0],
				rotation: opts.rotation ?? [0, 0, 0],
				packOrigin: origin(pack, String(index), opts.source)
			}
		}
	});
}

/**
 * Spawn a pack's full contents onto the table for an owner.
 * Packs are templates — this instantiates cards into the gameStore and never
 * mutates the pack itself. Facedown decks spawn shuffled (historical /play
 * behavior); scenario loads use spawnPackDeck directly with explicit order.
 */
export function spawnPack(pack: GamePackDef, opts: SpawnPackOptions = {}) {
	const ownerId = opts.ownerId ?? gameActions.getMyId();
	if (!ownerId) return console.error('Cannot spawn a pack without a playerId');

	pack.decks.forEach((deck, index) => {
		const isFaceUp = deck.isFaceUp ?? false;
		spawnPackDeck(pack, deck, { ...opts, ownerId, index, isFaceUp, shuffle: !isFaceUp });
	});
	pack.pieces?.forEach((_, index) => spawnPackPiece(pack, index, { ...opts, ownerId }));
	pack.overlays?.forEach((_, index) => spawnPackOverlay(pack, index, { ...opts, ownerId }));
}
