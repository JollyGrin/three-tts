import { gameActions } from '$lib/store/game/actions';
import type { GamePackDef } from './types';

/**
 * Spawn a pack's decks onto the table for the current player.
 * Packs are templates — this instantiates cards into the gameStore
 * (shuffled) and never mutates the pack itself.
 */
export function spawnPack(pack: GamePackDef) {
	const playerId = gameActions.getMyId();
	if (!playerId) return console.error('Cannot spawn a pack without a playerId');

	pack.decks.forEach((deck, index) => {
		const cards = deck.cards.map((card) => ({
			id: `card:${playerId}:${deck.slot}-${card.code}`,
			faceImageUrl: card.face,
			backImageUrl: deck.back
		}));

		// first deck uses addDeck's seat-relative default; extras offset sideways
		const position =
			index > 0 ? ([8.5 + index * 2.5, 0.4, 4.5] as [number, number, number]) : undefined;

		gameActions.addDeck({
			id: `deck:${playerId}:${deck.slot}`,
			deckId: `deck:${playerId}:${deck.slot}`,
			isFaceUp: deck.isFaceUp ?? false,
			deckBackImageUrl: deck.back,
			cards: deck.isFaceUp ? cards : (gameActions.shuffleCards(cards) ?? cards),
			position
		});
	});
}
