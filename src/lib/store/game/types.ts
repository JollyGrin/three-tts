/**
 * Who is entitled to a card's face.
 *
 * `public` — anyone at the table may see it (a face-up card).
 * `hidden` — nobody may, except the players listed in `seenBy` (peekers, and
 * the owner of the hand it sits in).
 *
 * This is the secrecy boundary, not a render flag: the server strips
 * `faceImageUrl` on the way out for anyone this descriptor excludes, so a
 * hidden card's face never reaches their client at all. The field is
 * server-owned — clients read it, and change it only through the flip / peek /
 * reveal actions.
 */
export type CardVisibility = { kind: 'public' } | { kind: 'hidden'; seenBy?: string[] };

/**
 * Cards on the Table
 * */
type CardDTO = {
	position: [number, number, number];
	rotation: [number, number, number];
	/** absent when you are not entitled to see this card — see CardVisibility */
	faceImageUrl: string;
	backImageUrl?: string;
	visibility?: CardVisibility;
	/** server-granted hold lease: the player currently dragging this card */
	heldBy?: string;
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
	 * Cards in deck are an array instead of record.
	 *
	 * Only ever populated for what you may see: a facedown deck arrives with no
	 * `cards` at all, a face-up pile with just its top card. Use `cardCount` for
	 * the size, and the draw / shuffle / placeOnDeck actions to change it — deck
	 * order lives on the server.
	 * */
	cards: CardInDeck[];
	/** server-derived size of the deck, including the cards you cannot see */
	cardCount?: number;
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
	/**
	 * This player's hand. Only ever present for yourself — another player's
	 * tray arrives as `handCount` and nothing else.
	 * */
	tray: Record<string, Partial<CardDTO | null>>;
	/** server-derived hand size, present for every player including you */
	handCount?: number;
	/**
	 * extend for future use with life/resources
	 * */
	metadata: any;
};

/**
 * Non-card table objects (tokens, pawns, counters). One generic shape
 * with a kind discriminator — see SPEC.md §4a.
 */
type PieceDTO = {
	position: [number, number, number];
	rotation: [number, number, number];
	kind: 'token' | 'pawn' | 'counter';
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
	/** server-granted hold lease: the player currently dragging this piece */
	heldBy?: string;
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
