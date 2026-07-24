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

export type GamePackDef = {
	id: string;
	name: string;
	/**
	 * 'table' = the shared game, loaded once per lobby by the host (TTS analog: the mod/save).
	 * 'player' = what one player brings, spawned per seat (TTS analog: a Saved Object, e.g. a deck-builder export).
	 */
	scope: 'table' | 'player';
	decks: PackDeckDef[];
};
