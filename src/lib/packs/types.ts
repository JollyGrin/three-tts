/**
 * A pack is a named, serializable definition of a game's contents —
 * decoupled from live game state. Packs are templates; the gameStore
 * holds the instance. See SPEC.md §4d.
 */
export type PackCardDef = {
	/** Stable code within the pack, e.g. 'AS' (ace of spades) */
	code: string;
	name?: string;
	/** Face ref: https url, `sheet:` descriptor, or `gen:` scheme */
	face: string;
};

export type PackDeckDef = {
	/** Stable id within the pack, e.g. 'main', 'discard' */
	slot: string;
	name: string;
	/** Face ref for the card back */
	back: string;
	isFaceUp?: boolean;
	cards: PackCardDef[];
};

export type PackPieceKind = 'token' | 'pawn' | 'counter';

export type PackPieceDef = {
	kind: PackPieceKind;
	name: string;
	/** hex tint; pawns/counters without images render in this color */
	color?: string;
	/** token top-face image ref (resolved like card faces) */
	imageUrl?: string;
	/** world radius of the piece footprint */
	radius?: number;
	/** counters start at this value */
	maxValue?: number;
	/** table-plane position [x, z] in world units */
	position: [number, number];
};

export type PackOverlayDef = {
	/** board/map image ref */
	imageUrl: string;
	/** width / height of the image */
	ratio: number;
	scale: number;
};

export type GamePackDef = {
	id: string;
	name: string;
	/**
	 * 'table' = the shared game, loaded once per lobby by the host (TTS analog: the mod/save).
	 * 'player' = what one player brings, spawned per seat (TTS analog: a Saved Object, e.g. a deck-builder export).
	 */
	scope: 'table' | 'player';
	decks: PackDeckDef[];
	/** tokens/pawns/counters that spawn with the pack */
	pieces?: PackPieceDef[];
	/** board/map images laid on the table */
	overlays?: PackOverlayDef[];
	/** provenance: set by converters (e.g. the TTS importer), absent on native packs */
	source?: 'tts';
};
