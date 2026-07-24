import type { GamePackDef, PackCardDef } from './types';

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export const SUIT_NAMES: Record<string, string> = {
	S: 'Spades',
	H: 'Hearts',
	D: 'Diamonds',
	C: 'Clubs'
};

export const RANK_NAMES: Record<string, string> = {
	A: 'Ace',
	J: 'Jack',
	Q: 'Queen',
	K: 'King'
};

/** Default card back for any deck without its own */
export const CARD_BACK_DEFAULT = 'gen:std52/back';

function cardName(rank: string, suit: string) {
	return `${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[suit]}`;
}

export const STANDARD_52_CARDS: PackCardDef[] = SUITS.flatMap((suit) =>
	RANKS.map((rank) => ({
		code: `${rank}${suit}`,
		name: cardName(rank, suit),
		face: `gen:std52/${rank}${suit}`
	}))
);

/**
 * Built-in default pack: a standard 52-card deck with procedurally
 * generated faces (no image assets shipped or fetched).
 */
export const STANDARD_52: GamePackDef = {
	id: 'standard-52',
	name: 'Standard Playing Cards',
	scope: 'player',
	decks: [
		{
			slot: 'main',
			name: 'Draw Pile',
			back: CARD_BACK_DEFAULT,
			cards: STANDARD_52_CARDS
		}
	]
};
