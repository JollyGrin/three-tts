/**
 * A pack is a named, serializable definition of a game's contents —
 * decoupled from live game state. Packs are templates; the gameStore
 * holds the instance. See SPEC.md §4d.
 */

// relative, not `$lib`: these types are a schema-generation root
// (scripts/build-schemas.ts), and that program is compiled without the
// SvelteKit path aliases
import type { DieSides } from '../store/game/types';
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

export type PackPieceKind = 'token' | 'pawn' | 'counter' | 'die';

/**
 * One alternate face of a multi-state piece (the TTS `States` analog: a
 * double-sided tile, an upgrade token, a transformed piece).
 */
export type PackPieceStateDef = {
	/** Face ref: https url, `sheet:` descriptor, or `gen:` scheme */
	face: string;
	/** shown on hover and in the state menu, e.g. 'Damaged' */
	name?: string;
};

export type PackPieceDef = {
	kind: PackPieceKind;
	name: string;
	/** hex tint; pawns/counters/dice without images render in this color */
	color?: string;
	/** token top-face image ref (resolved like card faces) */
	imageUrl?: string;
	/**
	 * Alternate faces the piece can be cycled through in play.
	 *
	 * **`states[0]` is the base face** — the list is the piece's COMPLETE set of
	 * faces, not extra ones added to `imageUrl`. A piece with `states` renders
	 * `states[n].face` and starts at n = 0 (a scenario placement can start it
	 * elsewhere); `imageUrl` is then only a fallback for consumers that ignore
	 * states, and exporters write it equal to `states[0].face`.
	 *
	 * Orthogonal to `kind: 'die'`: a die's faces are procedural geometry, not
	 * images, so it is never a stateful piece and carries no `states`.
	 */
	states?: PackPieceStateDef[];
	/**
	 * Index into `states` the piece spawns showing (default 0). This is the
	 * pack's own default — a TTS import puts the state the mod was saved in
	 * here; a scenario placement's `state` overrides it.
	 */
	state?: number;
	/** world radius of the piece footprint (a die's circumradius) */
	radius?: number;
	/** counters start at this value */
	maxValue?: number;
	/** dice only: how many faces the die has (defaults to 6) */
	sides?: DieSides;
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
	/** tokens/pawns/counters/dice that spawn with the pack */
	pieces?: PackPieceDef[];
	/** board/map images laid on the table */
	overlays?: PackOverlayDef[];
	/** provenance: set by converters (e.g. the TTS importer), absent on native packs */
	source?: 'tts';
};
