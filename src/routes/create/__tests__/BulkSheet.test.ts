/**
 * The bulk pane itself, driven through its real controls with `sliceCell`
 * mocked — the enumeration is tested pure in bulk-sheet.test.ts, this is
 * about the wiring: load a grid, see thumbnails (and a placeholder where the
 * sheet can't be read), exclude a cell, and hand a batch of cards back.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import BulkSheet from '../BulkSheet.svelte';
import { parseFaceRef } from '../face-ref';
import type { PackCardDef } from '$lib/packs/types';

/** cell 3 is the CORS-tainted one: `sliceCell` resolves null, not a throw */
vi.mock('$lib/tts/slice', () => ({
	sliceCell: vi.fn(async ({ index }: { index: number }) =>
		index === 3 ? null : `data:image/png;base64,cell${index}`
	)
}));

// the draggable Pane observes its own size; jsdom has no ResizeObserver
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

const SHEET = 'https://example.test/sheet.png';

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

const button = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

const input = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('.tp-lblv_l')]
		.find((el) => el.textContent === label)
		?.parentElement?.querySelector('input');

function type(element: HTMLInputElement, value: string) {
	element.value = value;
	element.dispatchEvent(new Event('change', { bubbles: true }));
}

function typeInto(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
	element.value = value;
	element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** paste a sheet and load a cols×rows grid, thumbnails and all */
async function loadGrid(cols = 3, rows = 2, props: Record<string, unknown> = {}) {
	const added: PackCardDef[][] = [];
	const { container } = render(BulkSheet, {
		props: { deckSlot: 'main', onadd: (cards: PackCardDef[]) => added.push(cards), ...props }
	});
	await settle();

	// one at a time: a tweakpane blade commits on the next flush, and two
	// changes dispatched back-to-back lose the first
	type(input(container, 'Sheet URL')!, SHEET);
	await settle();
	type(input(container, 'Columns')!, String(cols));
	await settle();
	type(input(container, 'Rows')!, String(rows));
	await settle();
	button(container, 'Load grid')!.click();
	await settle(150);

	return { container, added };
}

const tile = (container: HTMLElement, kind: 'include' | 'code' | 'name', index: number) =>
	container.querySelector<HTMLInputElement>(`[data-testid="bulk-${kind}-${index}"]`)!;

describe('BulkSheet', () => {
	it('turns a grid into one card per cell, row-major', async () => {
		const { container, added } = await loadGrid();

		expect(container.querySelectorAll('[data-testid^="bulk-include-"]')).toHaveLength(6);
		button(container, 'Add 6 cards to main')!.click();

		expect(added).toHaveLength(1);
		expect(added[0].map((c) => parseFaceRef(c.face).sheetIndex)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(added[0].every((c) => parseFaceRef(c.face).sheetUrl === SHEET)).toBe(true);
		expect(added[0][0]).toMatchObject({ code: 'card-1' });
	});

	it('shows a thumbnail per cell, and a placeholder where the slice failed', async () => {
		const { container } = await loadGrid();

		const thumbs = [...container.querySelectorAll('[data-testid^="bulk-thumb-"]')];
		expect(thumbs).toHaveLength(6);
		expect(thumbs[0].getAttribute('style')).toContain('data:image/png;base64,cell0');
		// cell 3 came back null — a placeholder tile, not a missing one
		expect(thumbs[3].getAttribute('style')).toBe('');
		expect(thumbs[3].textContent?.trim()).toBe('no preview');
	});

	it('still adds a cell that could not be sliced', async () => {
		const { container, added } = await loadGrid();
		button(container, 'Add 6 cards')!.click();

		expect(added[0].map((c) => parseFaceRef(c.face).sheetIndex)).toContain(3);
	});

	it('excludes a cell before adding', async () => {
		const { container, added } = await loadGrid();

		tile(container, 'include', 4).click();
		await settle();
		button(container, 'Add 5 cards')!.click();

		expect(added[0].map((c) => parseFaceRef(c.face).sheetIndex)).toEqual([0, 1, 2, 3, 5]);
	});

	it('includes only a range, so a dead trailing row is one gesture', async () => {
		const { container, added } = await loadGrid();

		type(input(container, 'To cell')!, '3');
		await settle();
		button(container, 'Include only this range')!.click();
		await settle();
		button(container, 'Add 4 cards')!.click();

		expect(added[0].map((c) => parseFaceRef(c.face).sheetIndex)).toEqual([0, 1, 2, 3]);
	});

	it('names cells in bulk and lets a per-cell edit win', async () => {
		const { container, added } = await loadGrid();

		const names = container.querySelector('textarea')!;
		typeInto(names, 'Ace\nKing\nQueen');
		await settle();
		expect(tile(container, 'name', 1).value).toBe('King');
		expect(tile(container, 'code', 1).value).toBe('king');

		typeInto(tile(container, 'name', 1), 'Hand-typed');
		await settle();
		button(container, 'Add 6 cards')!.click();

		expect(added[0].map((c) => c.name)).toEqual([
			'Ace',
			'Hand-typed',
			'Queen',
			undefined,
			undefined,
			undefined
		]);
		expect(added[0].map((c) => c.code)).toEqual([
			'ace',
			'hand-typed',
			'queen',
			'card-4',
			'card-5',
			'card-6'
		]);
	});

	it('never reuses a code the deck already has', async () => {
		const { container, added } = await loadGrid(2, 1, { takenCodes: ['card-1'] });

		button(container, 'Add 2 cards')!.click();
		expect(added[0].map((c) => c.code)).toEqual(['card-2', 'card-3']);
	});
});
