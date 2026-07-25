/**
 * Cards on the Table
 * */
export type CardDTO = {
	position: [number, number, number];
	rotation: [number, number, number];
	faceImageUrl: string;
	backImageUrl?: string;
};

export type CardInDeck = Omit<CardDTO, 'position' | 'rotation'> & { id: string };

/**
 * Provenance stamped on pack-spawned entities so a scenario export (tbps v2)
 * can reference the pack instead of inlining its content. Wire-safe: the
 * relay server merges state schema-agnostically.
 */
export type PackOrigin = {
	/** pack id, e.g. 'standard-52' */
	pack: string;
	/** content id within the pack: deck slot, or piece/overlay index */
	content: string;
	/** where the pack re-resolves from: 'builtin' or a fetchable URL */
	source?: string;
};

export type DeckDTO = {
	/**
	 * id format
	 * deck:playername:id
	 * */
	id: string;
	deckBackImageUrl?: string;
	/**
	 * true if the deck is face up (like discard pile)
	 * */
	isFaceUp?: boolean;
	position: [number, number, number];
	rotation: [number, number, number];
	/**
	 * Cards in deck are an array instead of record
	 * */
	cards: CardInDeck[];
	packOrigin?: PackOrigin;
	/** scenario authoring intent (tbps v2): reshuffle this deck on scenario load */
	shuffleOnLoad?: boolean;
	/**
	 * wall-clock ms of the last shuffle. Its only job is to CHANGE in the same
	 * patch as the reordered cards — the reorder alone is invisible from the
	 * back, the changed timestamp is what remote clients turn into the wiggle.
	 */
	shuffledAt?: number;
};

interface SeatState {
	seat:
		| 0 // 0deg
		| 1 // 180deg
		| 2 // 90deg
		| 3; // 270deg
}

export type PlayerDTO = SeatState & {
	id: string;
	joinTimestamp: number;
	tray: Record<string, Partial<CardDTO | null>>;
	/**
	 * server-owned presence: merged into the lobby state on socket
	 * connect/disconnect. Absent until the server has said anything —
	 * treat undefined as offline-unknown, never as connected.
	 * */
	connected?: boolean;
	/**
	 * extend for future use with life/resources
	 * */
	metadata: any;
};

/**
 * Non-card table objects (tokens, pawns, counters). One generic shape
 * with a kind discriminator — see SPEC.md §4a.
 */
export type PieceKind = 'token' | 'pawn' | 'counter';

/** One alternate face of a multi-state piece — see `PackPieceStateDef`. */
export type PieceStateDTO = {
	/** face ref, resolved like a card face */
	face: string;
	name?: string;
};

export type PieceDTO = {
	position: [number, number, number];
	rotation: [number, number, number];
	kind: PieceKind;
	name: string;
	/** hex tint; pawns/counters without images render in this color */
	color?: string;
	/** token top-face image ref (resolved like card faces) */
	imageUrl?: string;
	/**
	 * Faces this piece can be cycled through, `states[0]` being the base face.
	 * Carried on the entity (not looked up from the pack) so a client that
	 * never loaded the pack still renders whatever state the table is in.
	 */
	states?: PieceStateDTO[];
	/** index into `states`; absent = 0. Synced like every other mutation. */
	state?: number;
	/** world radius of the piece footprint */
	radius?: number;
	/** counter state */
	value?: number;
	maxValue?: number;
	packOrigin?: PackOrigin;
};

export type OverlayDTO = {
	id: string;
	position: [number, number, number];
	rotation: [number, number, number];
	imageUrl: string;
	/**
	 * ratio of width/height
	 * */
	ratio: number;
	scale: number;
	packOrigin?: PackOrigin;
};

/**
 * An authored placement guide on the felt: a card or piece released inside
 * `radius` of one finishes exactly on it. Table-scoped like overlays — snap
 * points belong to the board, not to a seat — and inert: nothing renders them
 * in /play, they only steer where a drop lands (see `utils/transforms/snap`).
 */
export type SnapPointDTO = {
	id: string;
	/**
	 * Table-space `[x, z]`. No y: a snap point is a spot on the felt, and what
	 * lands on it keeps its own resting height (a card on a card still stacks).
	 */
	position: [number, number];
	/**
	 * Yaw the landing snaps to, in **degrees**, or omitted to keep whatever
	 * rotation the entity already had. Degrees to match the card DTO's tap
	 * rotation (`actions/card.ts`) and TTS's `SnapPoints`.
	 */
	rotation?: number;
	/** catch radius in world units; omitted means `SNAP_RADIUS_DEFAULT` */
	radius?: number;
};

// index signatures (not Record<…>) so the generated JSON Schema keeps the
// entity value shapes — typescript-json-schema drops Record value types
export interface GameDTO {
	cards: { [cardId: string]: Partial<CardDTO> };
	decks: { [deckId: string]: Partial<DeckDTO> };
	players: { [playerId: string]: Partial<PlayerDTO> };
	/** null = remove */
	overlays?: { [overlayId: string]: Partial<OverlayDTO> | null };
	/** null = remove */
	pieces?: { [pieceId: string]: Partial<PieceDTO> | null };
	/** authored placement guides, keyed `snap:<n>`. null = remove */
	snapPoints?: { [snapId: string]: Partial<SnapPointDTO> | null };
}
