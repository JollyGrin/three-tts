/**
 * Spread layout: a pack's cards laid out side by side, derived purely from
 * (deck index, card index).
 *
 * The /create preview respawns every entity it owns on every keystroke, so any
 * hand-placed layout dies 300ms after you make it. A layout that is a pure
 * function of the draft turns that respawn into a visual no-op instead:
 * renaming a card leaves every tile exactly where it was, adding one appends a
 * tile at the end, removing one closes the gap. Nothing is preserved because
 * nothing needs to be.
 */
import { CARD_HEIGHT, CARD_REST_Y, CARD_WIDTH } from '$lib/utils/constants-cards';
import { EDGE_MARGIN, TABLE_HALF_Z } from '$lib/utils/constants-table';
import type { PackCardDef, PackDeckDef } from './types';

/**
 * Gap between neighbouring tiles. Bigger than it needs to look, because
 * `collectStackGroup` treats any two resting cards within
 * `CARD_STACK_RADIUS` (1.7) of each other as ONE loose pile — tighter tiles
 * would fan a whole row on hover and snap a dropped card onto its neighbour.
 * Both pitches below have to clear that radius (spread.test.ts asserts it).
 */
export const SPREAD_GAP = 0.4;

/** Extra breathing room between one deck's block and the next */
export const SPREAD_DECK_GAP = 1;

export const SPREAD_PITCH_X = CARD_WIDTH + SPREAD_GAP;
export const SPREAD_PITCH_Z = CARD_HEIGHT + SPREAD_GAP;

/**
 * Width the grid wraps within — not the felt's 60 units. The default camera
 * (y = 25, fov 35) frames roughly 28 units of X and 16 of Z, and the felt's
 * full width would fit 33 columns nobody could read. 18 keeps 10 columns
 * comfortably inside the shot.
 */
export const SPREAD_WIDTH = 18;

/** Columns the grid wraps at, auto-fitted to `SPREAD_WIDTH` */
export const SPREAD_COLS = Math.max(1, Math.floor(SPREAD_WIDTH / SPREAD_PITCH_X));

/** Centre of the leftmost column: fixed, so the left edge never drifts */
export const SPREAD_ORIGIN_X = -((SPREAD_COLS - 1) * SPREAD_PITCH_X) / 2;

/**
 * Centre of the first row. Fixed at the far edge of the shot and growing
 * towards the near one: a centred grid would shift every tile each time a new
 * row opened, which is exactly the re-laying-out this layout exists to avoid.
 */
export const SPREAD_ORIGIN_Z = -6;

/**
 * Cards a spread will lay out. Past this it carpets the felt with tiles too
 * small to read, so the editor falls back to piles and says so — the same
 * bargain `UNGROUP_MAX_CARDS` (40) strikes for `Shift+G` on the table, with a
 * wider limit because 60 cards is still 10×6 at the default camera.
 */
export const SPREAD_MAX_CARDS = 60;

/**
 * Deepest a row may sit and still be on the felt. The card cap alone doesn't
 * bound this: 20 decks of 3 cards is only 60 cards but 20 blocks, which would
 * march the last one off the table's near edge (a TTS import can look exactly
 * like that).
 */
export const SPREAD_MAX_Z = TABLE_HALF_Z - EDGE_MARGIN - CARD_HEIGHT / 2;

export type SpreadTile = {
	/** the card this tile shows, by reference into the deck's array */
	card: PackCardDef;
	row: number;
	col: number;
	position: [number, number, number];
};

type SpreadDeck = Pick<PackDeckDef, 'cards'>;

/** Total cards a spread of these decks would put on the table */
export function spreadCardCount(decks: SpreadDeck[]): number {
	return decks.reduce((total, deck) => total + (deck.cards?.length ?? 0), 0);
}

/** Why a spread refused, for the fallback's toast; null = go ahead */
export type SpreadRefusal = 'too-many' | 'too-deep';

export function spreadRefusal(decks: SpreadDeck[]): SpreadRefusal | null {
	if (spreadCardCount(decks) > SPREAD_MAX_CARDS) return 'too-many';
	if (spreadExtentZ(decks) > SPREAD_MAX_Z) return 'too-deep';
	return null;
}

/** False when the spread would carpet the felt or run off it */
export function canSpread(decks: SpreadDeck[]): boolean {
	return spreadRefusal(decks) === null;
}

/**
 * Z of the last tile the layout would place — the row-major order and the
 * downward block stacking make that the deepest one.
 */
export function spreadExtentZ(decks: SpreadDeck[]): number {
	const tiles = spreadLayout(decks).flat();
	return tiles.at(-1)?.position[2] ?? SPREAD_ORIGIN_Z;
}

/**
 * Tile positions for every card of every deck, as one array per deck (aligned
 * with `decks`, so an empty deck is simply an empty block).
 *
 * Row-major within a deck, wrapping at `SPREAD_COLS`; decks stack down the
 * table as separate blocks. Deterministic: same draft in, same positions out.
 */
export function spreadLayout(decks: SpreadDeck[]): SpreadTile[][] {
	let blockZ = SPREAD_ORIGIN_Z;

	return decks.map((deck) => {
		const cards = deck.cards ?? [];
		const tiles = cards.map((card, index) => {
			const row = Math.floor(index / SPREAD_COLS);
			const col = index % SPREAD_COLS;
			return {
				card,
				row,
				col,
				position: [
					SPREAD_ORIGIN_X + col * SPREAD_PITCH_X,
					CARD_REST_Y,
					blockZ + row * SPREAD_PITCH_Z
				] as [number, number, number]
			};
		});
		// an empty deck takes no vertical room, so it can't push the next block
		// off the table while someone is halfway through authoring it
		const rows = Math.ceil(cards.length / SPREAD_COLS);
		if (rows > 0) blockZ += rows * SPREAD_PITCH_Z + SPREAD_DECK_GAP;
		return tiles;
	});
}
