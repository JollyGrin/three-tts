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
	 * extend for future use with life/resources
	 * */
	metadata: any;
};

/**
 * Non-card table objects (tokens, pawns, counters). One generic shape
 * with a kind discriminator — see SPEC.md §4a.
 */
export type PieceKind = 'token' | 'pawn' | 'counter';

export type PieceDTO = {
	position: [number, number, number];
	rotation: [number, number, number];
	kind: PieceKind;
	name: string;
	/** hex tint; pawns/counters without images render in this color */
	color?: string;
	/** token top-face image ref (resolved like card faces) */
	imageUrl?: string;
	/** world radius of the piece footprint */
	radius?: number;
	/** counter state */
	value?: number;
	maxValue?: number;
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
}
