/**
 * The /create editor binds tweakpane controls directly to a `GamePackDef`
 * draft, so every optional field needs a concrete value while editing —
 * and empty editing defaults must not leak into exported files (the tbpp
 * validator rejects empty strings). These two functions are that boundary.
 */

import type {
	GamePackDef,
	PackCardDef,
	PackDeckDef,
	PackOverlayDef,
	PackPieceDef
} from '$lib/packs/types';
import { PIECE_RADIUS, COUNTER_MAX_DEFAULT } from '$lib/utils/constants-pieces';

export const PIECE_COLOR_DEFAULT = '#c8c4b8';

/** A `GamePackDef` with every pane-bound optional field made concrete */
export type EditorCard = PackCardDef & { name: string };
export type EditorDeck = Omit<PackDeckDef, 'cards' | 'isFaceUp'> & {
	isFaceUp: boolean;
	cards: EditorCard[];
};
export type EditorPiece = PackPieceDef & {
	color: string;
	imageUrl: string;
	radius: number;
	maxValue: number;
};
export type EditorPack = Omit<GamePackDef, 'decks' | 'pieces' | 'overlays'> & {
	decks: EditorDeck[];
	pieces: EditorPiece[];
	overlays: PackOverlayDef[];
};

/** Deep-clone a pack and fill every optional field the editor binds to. */
export function withEditorDefaults(pack: GamePackDef): EditorPack {
	return {
		...pack,
		decks: pack.decks.map((deck) => ({
			...deck,
			isFaceUp: deck.isFaceUp ?? false,
			cards: deck.cards.map((card) => ({ ...card, name: card.name ?? '' }))
		})),
		pieces: (pack.pieces ?? []).map((piece) => ({
			...piece,
			color: piece.color ?? PIECE_COLOR_DEFAULT,
			imageUrl: piece.imageUrl ?? '',
			radius: piece.radius ?? PIECE_RADIUS[piece.kind],
			maxValue: piece.maxValue ?? COUNTER_MAX_DEFAULT,
			position: [...piece.position] as [number, number]
		})),
		overlays: (pack.overlays ?? []).map((overlay) => ({ ...overlay }))
	};
}

/**
 * Deep-clone a draft, dropping empty editing defaults so the exported file
 * only carries what the creator actually set (`maxValue` is meaningful on
 * counters only, an unset image URL must not ship as `""`). Kept dumb on
 * purpose — real validation is parsePackFile's job.
 */
export function cleanForExport(draft: GamePackDef): GamePackDef {
	const pieces = (draft.pieces ?? []).map((piece) => ({
		kind: piece.kind,
		name: piece.name,
		...(piece.color ? { color: piece.color } : {}),
		...(piece.imageUrl ? { imageUrl: piece.imageUrl } : {}),
		...(piece.radius !== undefined ? { radius: piece.radius } : {}),
		...(piece.kind === 'counter' && piece.maxValue !== undefined
			? { maxValue: piece.maxValue }
			: {}),
		position: [...piece.position] as [number, number]
	}));
	const overlays = (draft.overlays ?? []).map((overlay) => ({ ...overlay }));

	return {
		id: draft.id,
		name: draft.name,
		scope: draft.scope,
		decks: draft.decks.map((deck) => ({
			slot: deck.slot,
			name: deck.name,
			back: deck.back,
			...(deck.isFaceUp ? { isFaceUp: true } : {}),
			cards: deck.cards.map((card) => ({
				code: card.code,
				...(card.name ? { name: card.name } : {}),
				face: card.face
			}))
		})),
		...(pieces.length > 0 ? { pieces } : {}),
		...(overlays.length > 0 ? { overlays } : {}),
		...(draft.source ? { source: draft.source } : {})
	};
}
