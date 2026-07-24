/**
 * Orchestrates a TTS Saved Object import: parse → slice sheets →
 * spawn decks/cards into the gameStore via existing actions.
 */

import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { CARD_BACK_DEFAULT } from '$lib/packs';
import { makeSheetRef } from '$lib/packs/resolve';
import { CARD_REST_Y } from '$lib/utils/constants-cards';
import { parseSavedObject, type ParsedCard } from './parse';
import { sliceCell } from './slice';

export type ImportReport = {
	decks: number;
	cards: number;
	pieces: number;
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

/**
 * Game state carries tiny `sheet:` refs, never image data — each client
 * slices locally at render time, so state survives refresh/sync limits
 * (SPEC §4d). Slicing here is only a warm-up + art health probe.
 */
async function resolveCard(card: ParsedCard): Promise<{
	name: string;
	faceImageUrl: string;
	backImageUrl: string;
	missingArt: boolean;
}> {
	const [face] = await Promise.all([sliceCell(card.face), sliceCell(card.back)]);
	return {
		name: card.name,
		faceImageUrl: makeSheetRef({ ...card.face, name: card.name }),
		backImageUrl: makeSheetRef({ ...card.back, name: card.name, back: true }),
		missingArt: face === null
	};
}

/** Import a TTS Saved Object JSON string; spawns onto the current table. */
export async function importTtsFile(text: string): Promise<ImportReport> {
	const parsed = parseSavedObject(JSON.parse(text));
	const playerId = gameActions.getMyId();
	if (!playerId) throw new Error('No player id — join a lobby first');

	const report: ImportReport = {
		decks: 0,
		cards: 0,
		pieces: 0,
		missingArt: 0,
		skipped: parsed.skipped
	};

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

		const firstBack = deck.cards[0]?.back;
		gameActions.addDeck({
			id: `deck:${playerId}:${slot}`,
			deckId: `deck:${playerId}:${slot}`,
			isFaceUp: false,
			deckBackImageUrl: firstBack ? makeSheetRef({ ...firstBack, back: true }) : CARD_BACK_DEFAULT,
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

	// tokens / pawns / counters land at their (mirrored) TTS table positions.
	// TTS stacks health dials exactly on top of their pawn/token — offset
	// counters sideways so they're visible and clickable next to their owner.
	const PIECE_REST_Y = 0.255 + 0.08;
	parsed.pieces.forEach((piece, i) => {
		report.pieces += 1;
		const offsetX = piece.kind === 'counter' ? 1.5 : 0;
		gameStore.updateState({
			pieces: {
				[`piece:${playerId}:${slugify(piece.name, 'piece')}-${i}`]: {
					kind: piece.kind,
					name: piece.name,
					color: piece.color,
					imageUrl: piece.imageUrl,
					radius: piece.radius,
					maxValue: piece.maxValue,
					value: piece.maxValue,
					position: [piece.position[0] + offsetX, PIECE_REST_Y, piece.position[1]],
					rotation: [0, 0, 0]
				}
			}
		});
	});

	return report;
}
