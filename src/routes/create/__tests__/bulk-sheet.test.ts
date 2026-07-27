/**
 * The bulk sprite-sheet path, without a network or a canvas: enumerating a
 * grid, excluding cells, allocating codes, and the ref round-trip that says a
 * generated card lands on the cell the grid showed.
 */
import { describe, expect, it } from 'vitest';
import {
	allocateCode,
	applyBulkNames,
	buildBulkCards,
	enumerateCells,
	planCodes,
	slugifyCode,
	type BulkCell
} from '../bulk-sheet';
import { buildFaceRef, parseFaceRef } from '../face-ref';
import { parsePackFile, serializePackFile } from '$lib/packs/file';
import { CARD_BACK_DEFAULT } from '$lib/packs/standard52';

const SHEET = 'https://example.test/sheet.png';

/** the grid as the pane would hand it over, with names filled per cell */
function cellsWith(cols: number, rows: number, edits: Partial<BulkCell>[] = []): BulkCell[] {
	const cells = enumerateCells(cols, rows);
	edits.forEach((edit, i) => Object.assign(cells[i], edit));
	return cells;
}

describe('enumerateCells', () => {
	it('is row-major with index 0 at the top-left', () => {
		const cells = enumerateCells(3, 2);
		expect(cells.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(cells[0]).toMatchObject({ index: 0, row: 0, col: 0 });
		expect(cells[2]).toMatchObject({ index: 2, row: 0, col: 2 }); // end of row 0
		expect(cells[3]).toMatchObject({ index: 3, row: 1, col: 0 }); // start of row 1
		expect(cells[5]).toMatchObject({ index: 5, row: 1, col: 2 });
	});

	it('includes every cell by default and clamps a nonsense grid to 1×1', () => {
		expect(enumerateCells(4, 4).every((c) => c.include)).toBe(true);
		expect(enumerateCells(0, -3)).toHaveLength(1);
	});
});

describe('allocateCode', () => {
	it('keeps a free code and suffixes a taken one', () => {
		expect(allocateCode('AS', new Set())).toBe('AS');
		expect(allocateCode('AS', new Set(['AS']))).toBe('AS-2');
	});

	it('bumps a numeric suffix instead of stacking one — AS, AS-2, AS-3', () => {
		const taken = new Set(['AS']);
		const first = allocateCode('AS', taken);
		taken.add(first);
		const second = allocateCode('AS', taken);
		expect([first, second]).toEqual(['AS-2', 'AS-3']);

		// duplicating the copy, not the original, lands in the same series
		taken.add(second);
		expect(allocateCode('AS-2', taken)).toBe('AS-4');
	});

	it('fixes the `card-N` collision a removal used to create', () => {
		// two cards left after removing the middle one: card-0, card-2
		const taken = new Set(['card-0', 'card-2']);
		expect(allocateCode('card-2', taken)).toBe('card-3'); // addCard's preferred code
	});

	it('never returns an empty code', () => {
		expect(allocateCode('   ', new Set())).toBe('card');
	});
});

describe('slugifyCode', () => {
	it('slugifies names and gives up on codeless ones', () => {
		expect(slugifyCode('Ace of Spades')).toBe('ace-of-spades');
		expect(slugifyCode('  —  ')).toBe('');
	});
});

describe('applyBulkNames', () => {
	it('applies one name per line, row-major, to the included cells', () => {
		const cells = cellsWith(2, 2);
		const named = applyBulkNames(cells, 'Ace\nKing\nQueen\nJack');
		expect(named.map((c) => c.name)).toEqual(['Ace', 'King', 'Queen', 'Jack']);
	});

	it('skips excluded cells so the list lines up with what the grid shows', () => {
		const cells = cellsWith(2, 2, [{}, { include: false }]);
		expect(applyBulkNames(cells, 'Ace\nKing\nQueen').map((c) => c.name)).toEqual([
			'Ace',
			'', // excluded — consumed no line
			'King',
			'Queen'
		]);
	});

	it('lets a per-cell edit win, without shifting the rest of the list', () => {
		const cells = cellsWith(2, 2, [{}, { name: 'Hand-typed', nameTouched: true }]);
		expect(applyBulkNames(cells, 'Ace\nKing\nQueen\nJack').map((c) => c.name)).toEqual([
			'Ace',
			'Hand-typed',
			'Queen',
			'Jack'
		]);
	});

	it('leaves cells past the end of the list unnamed', () => {
		expect(applyBulkNames(cellsWith(2, 2), 'Ace').map((c) => c.name)).toEqual(['Ace', '', '', '']);
	});
});

describe('planCodes', () => {
	it('derives codes from names, deduping repeats within the batch', () => {
		const cells = cellsWith(3, 1, [{ name: 'Ace' }, { name: 'Ace' }, { name: 'King' }]);
		expect([...planCodes(cells).values()]).toEqual(['ace', 'ace-2', 'king']);
	});

	it('falls back to prefix + a running number when names are blank', () => {
		const cells = cellsWith(2, 2, [{}, {}, { name: 'Named' }]);
		expect([...planCodes(cells, { prefix: 'troop' }).values()]).toEqual([
			'troop-1',
			'troop-2',
			'named',
			'troop-4'
		]);
	});

	it('numbers only the included cells and never plans an excluded one', () => {
		const cells = cellsWith(2, 2, [{}, { include: false }]);
		const planned = planCodes(cells);
		expect(planned.has(1)).toBe(false);
		expect([...planned.entries()]).toEqual([
			[0, 'card-1'],
			[2, 'card-2'],
			[3, 'card-3']
		]);
	});

	it('avoids the codes the deck already uses', () => {
		const cells = cellsWith(2, 1, [{ name: 'Ace' }, { name: 'King' }]);
		expect([...planCodes(cells, { taken: ['ace', 'ace-2'] }).values()]).toEqual(['ace-3', 'king']);
	});

	it('honours a hand-edited code over the derived one', () => {
		const cells = cellsWith(2, 1, [
			{ name: 'Ace', code: 'AS', codeTouched: true },
			{ name: 'Ace' }
		]);
		expect([...planCodes(cells).values()]).toEqual(['AS', 'ace']);
	});
});

describe('buildBulkCards', () => {
	it('adds one card per cell, row-major, each pointing at its own cell', () => {
		const cards = buildBulkCards({
			url: SHEET,
			cols: 3,
			rows: 2,
			cells: cellsWith(3, 2),
			namesText: 'Ace\nKing\nQueen\nJack\nTen\nNine'
		});

		expect(cards).toHaveLength(6);
		expect(cards.map((c) => c.name)).toEqual(['Ace', 'King', 'Queen', 'Jack', 'Ten', 'Nine']);
		expect(cards.map((c) => parseFaceRef(c.face).sheetIndex)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(new Set(cards.map((c) => c.code)).size).toBe(6);
	});

	it('stamps orientation on the whole batch only when asked (tableplace-132)', () => {
		const portrait = buildBulkCards({ url: SHEET, cols: 2, rows: 1, cells: cellsWith(2, 1) });
		expect(portrait.every((c) => c.orientation === undefined)).toBe(true);

		const landscape = buildBulkCards({
			url: SHEET,
			cols: 2,
			rows: 1,
			cells: cellsWith(2, 1),
			landscape: true
		});
		expect(landscape.every((c) => c.orientation === 'landscape')).toBe(true);
	});

	it('skips excluded cells — a partial last row is not a special case', () => {
		const cells = cellsWith(3, 2, [{}, {}, {}, {}, { include: false }, { include: false }]);
		const cards = buildBulkCards({ url: SHEET, cols: 3, rows: 2, cells });

		expect(cards).toHaveLength(4);
		expect(cards.map((c) => parseFaceRef(c.face).sheetIndex)).toEqual([0, 1, 2, 3]);
		// the grid the refs describe is still the whole sheet, holes and all
		expect(cards.every((c) => parseFaceRef(c.face).sheetRows === 2)).toBe(true);
	});

	it('keeps codes unique against the deck the cards are landing in', () => {
		const cells = cellsWith(2, 1, [{ name: 'Ace' }, { name: 'Ace' }]);
		const cards = buildBulkCards({ url: SHEET, cols: 2, rows: 1, cells, taken: ['ace'] });
		expect(cards.map((c) => c.code)).toEqual(['ace-2', 'ace-3']);
	});

	it('degrades a 1×1 grid to a plain URL, like the TTS importer', () => {
		const cards = buildBulkCards({ url: SHEET, cols: 1, rows: 1, cells: cellsWith(1, 1) });
		expect(cards.map((c) => c.face)).toEqual([SHEET]);
	});

	it('ships no `name` key for an unnamed cell', () => {
		const [card] = buildBulkCards({ url: SHEET, cols: 1, rows: 2, cells: cellsWith(1, 2) });
		expect(card.name).toBeUndefined();
		expect(card.code).toBe('card-1');
		// nor an empty one inside the payload — `"name":""` would draw a blank
		// placeholder just as surely as no name, at the cost of noise in the file
		expect(card.face).not.toContain('name');
	});

	it("carries a named cell's name into the payload, for the dead-sheet placeholder", () => {
		const cells = cellsWith(2, 1, [{ name: 'Strike' }]);
		const [named, unnamed] = buildBulkCards({ url: SHEET, cols: 2, rows: 1, cells });

		// field order matches the published sample in docs/packs.md §Face refs
		expect(named.face).toBe(`sheet:{"url":"${SHEET}","cols":2,"rows":1,"index":0,"name":"Strike"}`);
		expect(unnamed.face).toBe(`sheet:{"url":"${SHEET}","cols":2,"rows":1,"index":1}`);
		// `resolveCardImage` reads this when the sheet can't be fetched
		expect(JSON.parse(named.face.slice('sheet:'.length)).name).toBe('Strike');
	});

	it('keeps the payload name through an edit in the single-cell face editor', () => {
		const cells = cellsWith(2, 1, [{ name: 'Strike' }]);
		const [card] = buildBulkCards({ url: SHEET, cols: 2, rows: 1, cells });

		// re-pointing the ref at another cell must not drop the fallback name
		const draft = parseFaceRef(card.face);
		expect(draft.sheetExtra).toEqual({ name: 'Strike' });
		expect(buildFaceRef({ ...draft, sheetIndex: 1 })).toBe(
			`sheet:{"url":"${SHEET}","cols":2,"rows":1,"index":1,"name":"Strike"}`
		);
	});
});

describe('exported bulk cards survive a pack round-trip', () => {
	it('re-parses every generated ref back to the same cell', () => {
		const cols = 4;
		const rows = 3;
		const cards = buildBulkCards({
			url: SHEET,
			cols,
			rows,
			cells: cellsWith(cols, rows),
			namesText: 'Ace\nKing'
		});

		const reparsed = parsePackFile(
			serializePackFile({
				id: 'sheet-pack',
				name: 'Sheet Pack',
				scope: 'player',
				decks: [{ slot: 'main', name: 'Main', back: CARD_BACK_DEFAULT, cards }]
			})
		);

		expect(reparsed.decks[0].cards).toEqual(cards);
		reparsed.decks[0].cards.forEach((card, i) => {
			const draft = parseFaceRef(card.face);
			expect(draft.scheme).toBe('sheet');
			expect(draft.sheetUrl).toBe(SHEET);
			expect(draft.sheetCols).toBe(cols);
			expect(draft.sheetRows).toBe(rows);
			expect(draft.sheetIndex).toBe(i); // row-major, 0 = top-left
		});
	});
});
