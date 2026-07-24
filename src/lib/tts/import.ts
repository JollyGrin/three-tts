/**
 * Orchestrates a TTS Saved Object import: parse → slice sheets →
 * spawn decks/cards into the gameStore via existing actions.
 */

import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { CARD_BACK_DEFAULT } from '$lib/packs';
import { namedCardImage } from '$lib/packs/placeholder';
import { CARD_REST_Y } from '$lib/utils/constants-cards';
import { parseSavedObject, type ParsedCard } from './parse';
import { sliceCell } from './slice';

export type ImportReport = {
	decks: number;
	cards: number;
	missingArt: number;
	skipped: string[];
};

function slugify(name: string, fallback: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || fallback;
}

async function resolveCard(card: ParsedCard): Promise<{
	name: string;
	faceImageUrl: string;
	backImageUrl: string;
	missingArt: boolean;
}> {
	const [face, back] = await Promise.all([sliceCell(card.face), sliceCell(card.back)]);
	return {
		name: card.name,
		faceImageUrl: face ?? namedCardImage(card.name),
		backImageUrl: back ?? CARD_BACK_DEFAULT,
		missingArt: face === null
	};
}

/** Import a TTS Saved Object JSON string; spawns onto the current table. */
export async function importTtsFile(text: string): Promise<ImportReport> {
	const parsed = parseSavedObject(JSON.parse(text));
	const playerId = gameActions.getMyId();
	if (!playerId) throw new Error('No player id — join a lobby first');

	const report: ImportReport = { decks: 0, cards: 0, missingArt: 0, skipped: parsed.skipped };

	for (const [deckIndex, deck] of parsed.decks.entries()) {
		const resolved = await Promise.all(deck.cards.map(resolveCard));
		report.missingArt += resolved.filter((c) => c.missingArt).length;
		report.cards += resolved.length;

		const slot = slugify(deck.name, `imported-${deckIndex}`);
		// TTS DeckIDs are top-of-deck first; our facedown decks draw from the
		// END of the array, so reverse to preserve the deck's order.
		const cards = resolved
			.map((c, i) => ({
				id: `card:${playerId}:${slot}-${i}`,
				faceImageUrl: c.faceImageUrl,
				backImageUrl: c.backImageUrl
			}))
			.reverse();

		gameActions.addDeck({
			id: `deck:${playerId}:${slot}`,
			deckId: `deck:${playerId}:${slot}`,
			isFaceUp: false,
			deckBackImageUrl: resolved[0]?.backImageUrl ?? CARD_BACK_DEFAULT,
			cards,
			position: [8.5 - deckIndex * 2.5, 0.4, 4.5]
		});
		report.decks += 1;
	}

	for (const [i, looseCard] of parsed.looseCards.entries()) {
		const c = await resolveCard(looseCard);
		if (c.missingArt) report.missingArt += 1;
		report.cards += 1;
		gameStore.updateState({
			cards: {
				[`card:${playerId}:loose-${slugify(c.name, String(i))}-${i}`]: {
					position: [4 - i * 1.6, CARD_REST_Y, 1.5],
					rotation: [0, 0, 0],
					faceImageUrl: c.faceImageUrl,
					backImageUrl: c.backImageUrl
				}
			}
		});
	}

	return report;
}
