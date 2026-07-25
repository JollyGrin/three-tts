/**
 * Bulk sprite-sheet authoring: one cols×rows grid → one card per cell.
 *
 * A `sheet:` ref already names a single cell of a grid
 * (`sheet:{url,cols,rows,index}`, row-major, index 0 = top-left — docs/packs.md).
 * What was missing is anything that enumerates the whole grid, which is what
 * turned authoring a sheet into duplicate-and-increment-the-index.
 *
 * Everything here is pure: thumbnails (`sliceCell`) are a preview concern
 * layered on top in `BulkSheet.svelte`, so index/name/code logic stays
 * testable without a network, a canvas, or IndexedDB.
 */

import type { PackCardDef } from '$lib/packs/types';
import { cellToRef } from '$lib/tts/to-pack';

/** One cell of the loaded grid, as the pane edits it. */
export type BulkCell = {
	/** row-major position in the sheet — this is the `index` of the ref */
	index: number;
	row: number;
	col: number;
	/** included cells become cards; sheets routinely have dead trailing cells */
	include: boolean;
	/** per-cell override; only meaningful with `codeTouched` */
	code: string;
	name: string;
	/** a hand-edited field wins over any bulk fill */
	codeTouched: boolean;
	nameTouched: boolean;
	/** sliced data URL, or null when the sheet can't be read (CORS/dead link) */
	thumb: string | null;
	/** the slice is still in flight */
	loading: boolean;
};

export const BULK_CODE_PREFIX = 'card';

/**
 * Ceiling on one bulk add. Sheets in the wild top out around 10×7; this is
 * a guard against a fat-fingered 1000×1000, not a considered limit.
 */
export const BULK_MAX_CELLS = 400;

function grid(cols: number, rows: number): { cols: number; rows: number } {
	return {
		cols: Math.max(1, Math.round(cols || 0)),
		rows: Math.max(1, Math.round(rows || 0))
	};
}

/** Enumerate `cols × rows` cells, row-major, index 0 = top-left. */
export function enumerateCells(cols: number, rows: number): BulkCell[] {
	const size = grid(cols, rows);
	return Array.from({ length: size.cols * size.rows }, (_, index) => ({
		index,
		row: Math.floor(index / size.cols),
		col: index % size.cols,
		include: true,
		code: '',
		name: '',
		codeTouched: false,
		nameTouched: false,
		thumb: null,
		loading: true
	}));
}

/** `Ace of Spades` → `ace-of-spades`; empty when nothing survives. */
export function slugifyCode(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * A code that is free in `taken`. `code` is the entity-id component
 * (`card:<owner>:<slot>-<code>`, spawn.ts), so two cards sharing one collide
 * into a single table entity — every code the editor mints goes through here.
 *
 * A numeric suffix is bumped rather than stacked, so duplicating `AS` gives
 * `AS-2` and duplicating that gives `AS-3` (not `AS-2-2`). Same shape as
 * `allocateCardId` (store/game/actions/deck.ts) and `nextPieceId` (piece.ts).
 */
export function allocateCode(preferred: string, taken: ReadonlySet<string>): string {
	const wanted = preferred.trim() || BULK_CODE_PREFIX;
	if (!taken.has(wanted)) return wanted;

	const match = /^(.+)-(\d+)$/.exec(wanted);
	const base = match ? match[1] : wanted;
	let n = match ? Number(match[2]) + 1 : 2;
	while (taken.has(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

/**
 * Apply a name-per-line list to the included cells, row-major.
 *
 * Hand-edited cells keep their name but still consume their line, so the
 * pasted list stays lined up with what the grid shows. Excluded cells are
 * skipped entirely — a name list is written for the cards you're adding.
 */
export function applyBulkNames(cells: BulkCell[], text: string): BulkCell[] {
	const lines = (text ?? '').split('\n').map((line) => line.trim());
	let position = 0;
	return cells.map((cell) => {
		if (!cell.include) return { ...cell };
		const line = lines[position++] ?? '';
		if (cell.nameTouched || !line) return { ...cell };
		return { ...cell, name: line };
	});
}

export type CodePlanOptions = {
	/** used when a cell has no name — `prefix-1`, `prefix-2`, … */
	prefix?: string;
	/** codes already spoken for, e.g. the cards already in the deck */
	taken?: Iterable<string>;
};

/**
 * The code each included cell would get, keyed by cell index: a per-cell
 * edit, else the name slugified, else `prefix-N` — then de-duplicated
 * against `taken` and against the rest of the batch.
 */
export function planCodes(cells: BulkCell[], options: CodePlanOptions = {}): Map<number, string> {
	const taken = new Set(options.taken ?? []);
	const prefix = (options.prefix ?? '').trim() || BULK_CODE_PREFIX;
	const planned = new Map<number, string>();

	let running = 0;
	for (const cell of cells) {
		if (!cell.include) continue;
		running++;
		const preferred =
			(cell.codeTouched && cell.code.trim()) || slugifyCode(cell.name) || `${prefix}-${running}`;
		const code = allocateCode(preferred, taken);
		taken.add(code);
		planned.set(cell.index, code);
	}
	return planned;
}

export type BulkAddOptions = CodePlanOptions & {
	url: string;
	cols: number;
	rows: number;
	cells: BulkCell[];
	/** name-per-line list; omit when the cells already carry resolved names */
	namesText?: string;
};

/**
 * One `PackCardDef` per included cell, in row-major order, each pointing at
 * its own cell of the sheet. A 1×1 grid degrades to a plain URL ref, the same
 * shortcut the TTS importer takes.
 *
 * A named cell puts its name inside the `sheet:` payload as well as on the
 * card. That field exists for exactly one purpose (docs/packs.md): when the
 * sheet can't be fetched, `resolveCardImage` draws a named placeholder instead
 * of a blank one — which is the whole point of a bulk-authored deck degrading
 * gracefully. The cost is that renaming the card later leaves the ref's copy
 * stale; it only ever affects that fallback art, never identity or ordering,
 * and re-adding the cell refreshes it. The TTS importer makes the same trade.
 */
export function buildBulkCards(options: BulkAddOptions): PackCardDef[] {
	const size = grid(options.cols, options.rows);
	const url = options.url.trim();
	const cells =
		options.namesText === undefined
			? options.cells
			: applyBulkNames(options.cells, options.namesText);
	const codes = planCodes(cells, { prefix: options.prefix, taken: options.taken });

	return cells
		.filter((cell) => cell.include)
		.map((cell) => {
			const name = cell.name.trim();
			return {
				code: codes.get(cell.index) ?? '',
				...(name ? { name } : {}),
				face: cellToRef(
					{ url, cols: size.cols, rows: size.rows, index: cell.index },
					name ? { name } : {}
				)
			};
		});
}
