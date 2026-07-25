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
import { PIECE_RADIUS, COUNTER_MAX_DEFAULT, DIE_SIDES_DEFAULT } from '$lib/utils/constants-pieces';

export const PIECE_COLOR_DEFAULT = '#c8c4b8';

/** A `GamePackDef` with every pane-bound optional field made concrete */
export type EditorCard = PackCardDef & { name: string };
export type EditorDeck = Omit<PackDeckDef, 'cards' | 'isFaceUp'> & {
	isFaceUp: boolean;
	cards: EditorCard[];
};
export type EditorPieceState = { face: string; name: string };
export type EditorPiece = Omit<PackPieceDef, 'states'> & {
	color: string;
	imageUrl: string;
	radius: number;
	maxValue: number;
	states: EditorPieceState[];
	state: number;
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
			states: (piece.states ?? []).map((state) => ({ face: state.face, name: state.name ?? '' })),
			state: piece.state ?? 0,
			sides: piece.sides ?? DIE_SIDES_DEFAULT,
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
	const pieces = (draft.pieces ?? []).map((piece) => {
		// a state with no face is an empty editor row, not authoring intent.
		// Never on a die: its faces are procedural, so `states` on one is a
		// category error and must not reach the file (see PackPieceDef.states).
		const states =
			piece.kind === 'die'
				? []
				: (piece.states ?? [])
						.filter((state) => state.face)
						.map((state) => ({ face: state.face, ...(state.name ? { name: state.name } : {}) }));
		// states[0] IS the base face (see PackPieceDef.states), so imageUrl mirrors
		// it — a consumer that ignores states still shows the right image
		const imageUrl = states[0]?.face ?? piece.imageUrl;
		return {
			kind: piece.kind,
			name: piece.name,
			...(piece.color ? { color: piece.color } : {}),
			...(imageUrl ? { imageUrl } : {}),
			...(states.length ? { states } : {}),
			// 0 is the default, so it stays out of the file
			...(states.length && piece.state ? { state: piece.state } : {}),
			...(piece.radius !== undefined ? { radius: piece.radius } : {}),
			...(piece.kind === 'counter' && piece.maxValue !== undefined
				? { maxValue: piece.maxValue }
				: {}),
			...(piece.kind === 'die' && piece.sides !== undefined ? { sides: piece.sides } : {}),
			position: [...piece.position] as [number, number]
		};
	});
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
