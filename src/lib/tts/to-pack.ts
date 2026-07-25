/**
 * TTS parse output → native `GamePackDef`. TTS is an import boundary, not a
 * superset spec: every TTS concept maps into pack primitives here, and TTS
 * fields (CardID math, sprite sheets as first-class objects, Lua) never
 * appear in the tbpp format itself. See docs/packs.md.
 */

import type { GamePackDef, PackDeckDef, PackPieceDef } from '$lib/packs/types';
import { CARD_BACK_DEFAULT } from '$lib/packs/standard52';
import { makeSheetRef } from '$lib/packs/resolve.svelte';
import type { ParsedSavedObject, ParsedCard, SheetCell } from './parse';

export type TtsToPackOptions = {
	id?: string;
	name?: string;
	/** override the lone-deck-means-player heuristic (SPEC §4d) */
	scope?: GamePackDef['scope'];
};

function slugify(name: string, fallback: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || fallback;
}

/** Whole-image cells become plain URLs; real sheet cells become `sheet:` refs. */
export function cellToRef(cell: SheetCell, opts: { name?: string; back?: boolean } = {}): string {
	if (cell.cols === 1 && cell.rows === 1) return cell.url;
	return makeSheetRef({ ...cell, ...opts });
}

function toDeck(
	name: string,
	cards: ParsedCard[],
	slotFallback: string,
	isFaceUp?: boolean
): PackDeckDef {
	const seen = new Set<string>();
	return {
		slot: slugify(name, slotFallback),
		name,
		back: cards[0] ? cellToRef(cards[0].back, { back: true }) : CARD_BACK_DEFAULT,
		...(isFaceUp !== undefined ? { isFaceUp } : {}),
		cards: cards.map((card, i) => {
			let code = slugify(card.name, `card-${i}`);
			if (seen.has(code)) code = `${code}-${i}`;
			seen.add(code);
			return {
				code,
				...(card.name ? { name: card.name } : {}),
				face: cellToRef(card.face, { name: card.name })
			};
		})
	};
}

/**
 * Convert a parsed TTS Saved Object into a native pack. Loose cards group
 * into a face-up 'loose' deck (a pile is the closest pack primitive);
 * unsupported objects stay behind in `parsed.skipped` — conversion never
 * fails on them.
 */
export function ttsToPack(parsed: ParsedSavedObject, opts: TtsToPackOptions = {}): GamePackDef {
	const name = opts.name ?? parsed.decks[0]?.name ?? 'TTS Import';
	const decks = parsed.decks.map((deck, i) => toDeck(deck.name, deck.cards, `deck-${i}`));
	if (parsed.looseCards.length > 0) {
		decks.push(toDeck('Loose Cards', parsed.looseCards, 'loose', true));
	}

	const pieces: PackPieceDef[] = parsed.pieces.map((p) => ({
		kind: p.kind,
		name: p.name,
		...(p.color !== undefined ? { color: p.color } : {}),
		...(p.imageUrl !== undefined ? { imageUrl: p.imageUrl } : {}),
		...(p.radius !== undefined ? { radius: p.radius } : {}),
		...(p.maxValue !== undefined ? { maxValue: p.maxValue } : {}),
		position: p.position
	}));

	return {
		id: opts.id ?? `imported:${slugify(name, 'tts')}`,
		name,
		// deck-builder exports carry a lone deck (player pack); anything more is a table setup
		scope: opts.scope ?? (parsed.decks.length === 1 ? 'player' : 'table'),
		decks,
		...(pieces.length > 0 ? { pieces } : {}),
		source: 'tts'
	};
}
