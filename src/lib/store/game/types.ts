/**
 * Cards on the Table
 * */
type CardDTO = {
	position: [number, number, number];
	rotation: [number, number, number];
	faceImageUrl: string;
	backImageUrl?: string;
};

type CardInDeck = Omit<CardDTO, 'position' | 'rotation'> & { id: string };
type DeckDTO = {
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

type PlayerDTO = SeatState & {
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

type PieceDTO = {
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

type OverlayDTO = {
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

export interface GameDTO {
	cards: Record<string, Partial<CardDTO>>; // cardId, state
	decks: Record<string, Partial<DeckDTO>>; // deckId, state
	players: Record<string, Partial<PlayerDTO>>; // playerId, state
	overlays?: Record<string, Partial<OverlayDTO> | null>; // overlayId, state (null = remove)
	pieces?: Record<string, Partial<PieceDTO> | null>; // pieceId, state (null = remove)
}
