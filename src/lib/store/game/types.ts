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

export interface GameDTO {
	cards: Record<string, Partial<CardDTO>>; // cardId, state
	decks: Record<string, Partial<DeckDTO>>; // deckId, state
	players: Record<string, Partial<PlayerDTO>>; // playerId, state
}
