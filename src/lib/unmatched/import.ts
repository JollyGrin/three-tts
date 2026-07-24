/**
 * Import an Unmatched deck by deck code via the unbrewed engine proxy
 * (CORS-open JSON proxy for unmatched.cards / the-unmatched.club decks —
 * both sites share deck infrastructure). Art is per-card whole images
 * (imgur serves open CORS, so they load as WebGL textures directly),
 * so no sprite-sheet slicing is involved.
 */

import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { CARD_BACK_DEFAULT } from '$lib/packs';
import { CARD_REST_Y } from '$lib/utils/constants-cards';

const DECK_API = 'https://unbrewed-engine-production.up.railway.app/api/unmatched-deck/';

type UnmatchedCard = {
	title?: string;
	quantity?: number;
	imageUrl?: string;
};

type UnmatchedDeckResponse = {
	name?: string;
	deck_data?: {
		name?: string;
		appearance?: { cardbackUrl?: string };
		cards?: UnmatchedCard[];
		ruleCards?: UnmatchedCard[];
	};
};

/** Accepts a bare code ('72Dz') or a full unmatched.cards/club deck URL. */
export function extractDeckCode(input: string): string {
	const trimmed = input.trim();
	const match = trimmed.match(/\/decks\/([^/?#]+)/);
	return (match ? match[1] : trimmed).trim();
}

export type UnmatchedImportReport = {
	name: string;
	cards: number;
	ruleCards: number;
};

export async function importUnmatchedDeck(codeOrUrl: string): Promise<UnmatchedImportReport> {
	const code = extractDeckCode(codeOrUrl);
	if (!code) throw new Error('Enter a deck code');
	const playerId = gameActions.getMyId();
	if (!playerId) throw new Error('No player id — join a lobby first');

	const response = await fetch(DECK_API + encodeURIComponent(code));
	if (!response.ok) throw new Error(`Deck "${code}" not found (${response.status})`);
	const data = (await response.json()) as UnmatchedDeckResponse;

	const deckData = data.deck_data;
	const drawCards = deckData?.cards ?? [];
	if (drawCards.length === 0) throw new Error('Deck has no cards');

	const name = data.name ?? deckData?.name ?? code;
	const back = deckData?.appearance?.cardbackUrl ?? CARD_BACK_DEFAULT;
	const slot = extractDeckCode(code).toLowerCase();

	const cards = drawCards.flatMap((card, cardIndex) =>
		Array.from({ length: Math.max(1, card.quantity ?? 1) }, (_, copy) => ({
			id: `card:${playerId}:${slot}-${cardIndex}-${copy}`,
			faceImageUrl: card.imageUrl ?? '',
			backImageUrl: back
		}))
	);

	gameActions.addDeck({
		id: `deck:${playerId}:${slot}`,
		deckId: `deck:${playerId}:${slot}`,
		isFaceUp: false,
		deckBackImageUrl: back,
		cards: gameActions.shuffleCards(cards) ?? cards
	});

	// rule/hero cards go face-up on the table next to the deck
	const ruleCards = deckData?.ruleCards ?? [];
	ruleCards.forEach((card, i) => {
		gameStore.updateState({
			cards: {
				[`card:${playerId}:${slot}-rule-${i}`]: {
					position: [4 - i * 1.6, CARD_REST_Y, 1.5],
					rotation: [0, 0, 0],
					faceImageUrl: card.imageUrl ?? '',
					backImageUrl: back
				}
			}
		});
	});

	return { name, cards: cards.length, ruleCards: ruleCards.length };
}
