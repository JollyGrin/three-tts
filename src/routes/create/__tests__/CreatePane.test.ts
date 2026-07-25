/**
 * Drives the real tweakpane controls in jsdom rather than calling the editor's
 * functions directly — that's what proves the pane is wired to the draft and
 * that the draft reaches the table as a live preview.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import CreatePane from '../CreatePane.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { CARD_BACK_DEFAULT } from '$lib/packs/standard52';
import { previewLayout } from '../preview-layout';
import { pickCard } from '$lib/store/cardPick';
import { SPREAD_MAX_CARDS, SPREAD_PITCH_X } from '$lib/packs/spread';
import { serializePackFile } from '$lib/packs/file';
import type { GamePackDef } from '$lib/packs/types';

// the draggable Pane observes its own size; jsdom has no ResizeObserver
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

/** tweakpane renders asynchronously, and the preview respawn is debounced 300ms */
const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const settlePreview = () => settle(400);

const button = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

const labels = (container: HTMLElement) =>
	[...container.querySelectorAll('.tp-lblv_l')].map((el) => el.textContent);

/** the text inputs of every row carrying this label, in DOM order */
const inputs = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('.tp-lblv_l')]
		.filter((el) => el.textContent === label)
		.map((el) => el.parentElement?.querySelector('input'));

/** the text input of the (first) row carrying this label */
const input = (container: HTMLElement, label: string) => inputs(container, label)[0];

/** the (single) list offering this option — lists render as <select> */
const listWith = (container: HTMLElement, option: string) =>
	[...container.querySelectorAll('select')].find((s) =>
		[...s.options].some((o) => o.textContent?.includes(option))
	)!;

/**
 * The card picker's options, which are labelled `<index>: <code>` — the deck
 * picker is labelled the same way and comes first, so this takes the second.
 */
const cardCodes = (container: HTMLElement) => {
	const select = [...container.querySelectorAll('select')].filter((s) =>
		[...s.options].some((o) => /^\d+: /.test(o.textContent ?? ''))
	)[1];
	return [...(select?.options ?? [])].map((o) => (o.textContent ?? '').replace(/^\d+: /, ''));
};

/** every face-scheme picker on screen, in DOM order (deck back, then card face) */
const schemePickers = (container: HTMLElement) =>
	[...container.querySelectorAll('select')].filter((s) =>
		[...s.options].some((o) => o.textContent?.includes('Sprite sheet'))
	);

function choose(select: HTMLSelectElement, text: string) {
	select.selectedIndex = [...select.options].findIndex((o) => o.textContent?.includes(text));
	select.dispatchEvent(new Event('change', { bubbles: true }));
}

function type(element: HTMLInputElement, value: string) {
	element.value = value;
	element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function mount() {
	const { container } = render(CreatePane);
	await settle();
	return container;
}

describe('CreatePane', () => {
	beforeEach(() => {
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });
		localStorage.clear();
		previewLayout.set('deck'); // module state: the last test's choice would leak
	});

	it('mounts with a starter pack and previews it on the table', async () => {
		await mount();
		await settlePreview();

		const decks = get(gameStore).decks ?? {};
		expect(Object.keys(decks)).toEqual(['deck:preview:main']);
		expect(decks['deck:preview:main'].cards).toHaveLength(1);
		expect(decks['deck:preview:main'].cards?.[0].faceImageUrl).toBe('gen:std52/AS');
	});

	it('adding a deck and a card updates the live preview', async () => {
		const container = await mount();
		await settlePreview();

		button(container, 'Add deck')!.click();
		await settle();
		button(container, 'Add card')!.click();
		await settlePreview();

		const decks = get(gameStore).decks ?? {};
		// the new deck becomes the cursor's deck, so the card lands in it
		expect(Object.keys(decks).sort()).toEqual(['deck:preview:deck-1', 'deck:preview:main']);
		expect(decks['deck:preview:deck-1'].cards).toHaveLength(1);
	});

	it('exposes the per-kind piece fields and previews spawned pieces', async () => {
		const container = await mount();

		// the Pieces folder's kind list is the second select (Scope is the first)
		const selects = [...container.querySelectorAll('select')];
		const kindSelect = selects.find((s) =>
			[...s.options].some((o) => o.textContent?.includes('Counter'))
		)!;
		kindSelect.selectedIndex = 2; // Token, Pawn, Counter
		kindSelect.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();

		button(container, 'Add counter')!.click();
		await settlePreview();

		expect(labels(container)).toContain('Max value'); // counter-only control
		const pieces = Object.values(get(gameStore).pieces ?? {});
		expect(pieces).toHaveLength(1);
		expect(pieces[0]).toMatchObject({ kind: 'counter', value: 20, maxValue: 20 });
	});

	it('saves the pack to the library (packs:v1) and re-opens it for editing', async () => {
		const container = await mount();
		button(container, 'Save to library')!.click();
		await settle();

		const stored = JSON.parse(localStorage.getItem('packs:v1') ?? '{}');
		expect(Object.keys(stored)).toEqual(['my-pack']);
		expect(stored['my-pack'].pack.decks[0].cards[0].face).toBe('gen:std52/AS');

		button(container, 'Edit selected')!.click();
		await settlePreview();
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:preview:main']);
	});

	it('does not preview a deck that has no cards yet', async () => {
		const container = await mount();
		button(container, 'Add deck')!.click(); // new decks start empty
		await settlePreview();

		// an empty deck has no cards[0] for Deck.svelte to render
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:preview:main']);
	});

	it('gives a new card the deck back as its face, so it renders immediately', async () => {
		const container = await mount();
		button(container, 'Add card')!.click();
		await settlePreview();

		const cards = get(gameStore).decks?.['deck:preview:main'].cards ?? [];
		expect(cards).toHaveLength(2);
		// starter deck's back — a blank face resolves to '' and shows nothing
		expect(cards[1].faceImageUrl).toBe(CARD_BACK_DEFAULT);
	});

	it('gives every card a distinct code — duplicating twice never repeats one', async () => {
		const container = await mount();
		// the starter deck holds `AS`; `code` is the entity-id component, so a
		// repeat would collapse two cards into one table entity
		button(container, 'Duplicate card')!.click();
		await settle();
		expect(cardCodes(container)).toEqual(['AS', 'AS-2']);

		// duplicate the original again: the copy can't be `AS-2` a second time
		button(container, 'Duplicate card')!.click();
		await settle();
		expect(cardCodes(container)).toEqual(['AS', 'AS-2', 'AS-3']);
	});

	it('does not reuse a `card-N` code after a card is removed', async () => {
		const container = await mount();
		button(container, 'Add card')!.click(); // card-1
		await settle();
		button(container, 'Add card')!.click(); // card-2
		await settle();
		button(container, 'Remove card')!.click();
		await settle();
		// `card-${cards.length}` is `card-2` again here, and it's still in use —
		// the old code minted the collision, this one steps past it
		button(container, 'Add card')!.click();
		await settle();

		const codes = cardCodes(container);
		expect(codes).toHaveLength(3);
		expect(new Set(codes).size).toBe(3);
	});

	it('bulk-adds a sheet grid into the selected deck', async () => {
		const container = await mount();

		// the bulk pane's own controls: URL, columns, rows, then Preview grid
		type(input(container, 'Sheet URL')!, 'https://example.test/sheet.png');
		await settle();
		type(input(container, 'Columns')!, '2');
		await settle();
		type(input(container, 'Rows')!, '2');
		await settle();
		button(container, 'Preview grid')!.click();
		await settle();

		button(container, 'Add 4 cards to main')!.click();
		await settlePreview();

		const cards = get(gameStore).decks?.['deck:preview:main'].cards ?? [];
		expect(cards).toHaveLength(5); // the starter Ace plus the grid
		expect(
			cards.slice(1).map((c) => JSON.parse(c.faceImageUrl!.slice('sheet:'.length)).index)
		).toEqual([0, 1, 2, 3]);
		expect(cardCodes(container)).toEqual(['AS', 'card-1', 'card-2', 'card-3', 'card-4']);
	});

	it('sets the selected card face inline, without a separate builder', async () => {
		const container = await mount();
		// one face editor for the deck back, one for the selected card
		const pickers = schemePickers(container);
		expect(pickers).toHaveLength(2);

		choose(pickers[1], 'Image URL');
		await settle();
		type(input(container, 'Image URL')!, 'https://example.test/ace.png');
		await settlePreview();

		const cards = get(gameStore).decks?.['deck:preview:main'].cards ?? [];
		expect(cards[0].faceImageUrl).toBe('https://example.test/ace.png');
	});

	it('sets the deck back inline from the deck section', async () => {
		const container = await mount();
		choose(schemePickers(container)[0], 'Image URL');
		await settle();
		type(input(container, 'Image URL')!, 'https://example.test/back.png');
		await settlePreview();

		expect(get(gameStore).decks?.['deck:preview:main'].deckBackImageUrl).toBe(
			'https://example.test/back.png'
		);
	});

	it('flips the cards on the preview table from the pane, no keyboard needed', async () => {
		const container = await mount();
		await settlePreview();

		gameStore.updateState({
			cards: {
				'card:preview:main-AS': {
					position: [0, 0.3, 0],
					rotation: [180, 0, 0], // as it arrives off a facedown pile
					faceImageUrl: 'gen:std52/AS'
				}
			}
		});
		button(container, 'Flip cards on table')!.click();
		await settle();

		expect(get(gameStore).cards?.['card:preview:main-AS'].rotation).toEqual([0, 0, 0]);
	});

	describe('Spread layout', () => {
		/** switch the preview to Spread through the real pane control */
		async function spread(container: HTMLElement) {
			choose(listWith(container, 'Spread'), 'Spread');
			await settlePreview();
		}

		it('lays every card of every deck out face-up, with no piles left', async () => {
			const container = await mount();
			button(container, 'Add deck')!.click();
			await settle();
			button(container, 'Add card')!.click();
			await settle();
			await spread(container);

			const state = get(gameStore);
			expect(Object.keys(state.decks ?? {})).toEqual([]);
			expect(Object.keys(state.cards ?? {}).sort()).toEqual([
				'card:preview:deck-1-card-0',
				'card:preview:main-AS'
			]);
			// face-up regardless of the decks' isFaceUp (both start facedown)
			expect(Object.values(state.cards ?? {}).every((c) => c.rotation?.[0] === 0)).toBe(true);
			// separate blocks: each deck starts its own grid at the same left column
			const [a, b] = Object.keys(state.cards ?? {})
				.sort()
				.map((id) => state.cards![id].position!);
			expect(a[0]).toBeCloseTo(b[0]);
			expect(a[2]).not.toBeCloseTo(b[2]);
		});

		it('leaves the other tiles in place when a card is added or edited', async () => {
			const container = await mount();
			await spread(container);
			const before = get(gameStore).cards!['card:preview:main-AS'].position;

			button(container, 'Add card')!.click();
			await settlePreview();

			const cards = get(gameStore).cards!;
			expect(Object.keys(cards)).toHaveLength(2);
			expect(cards['card:preview:main-AS'].position).toEqual(before);
			// the new card is appended one column across, not re-laid out
			expect(cards['card:preview:main-card-1'].position![0] - before![0]).toBeCloseTo(
				SPREAD_PITCH_X
			);

			// third Name row: pack, deck, then the selected card (DOM order) — the
			// draft check below is what proves it was the card's
			type(inputs(container, 'Name')[2]!, 'renamed');
			await settlePreview();
			expect(get(gameStore).cards!['card:preview:main-AS'].position).toEqual(before);
			expect(cards['card:preview:main-card-1'].position).toEqual(
				get(gameStore).cards!['card:preview:main-card-1'].position
			);

			button(container, 'Save to library')!.click();
			await settle();
			const saved = JSON.parse(localStorage.getItem('packs:v1') ?? '{}');
			expect(saved['my-pack'].pack.decks[0].cards[1].name).toBe('renamed');
		});

		it('re-forms the piles when switched back to Deck', async () => {
			const container = await mount();
			await spread(container);
			const spreadPositions = get(gameStore).cards!['card:preview:main-AS'].position;

			choose(listWith(container, 'Spread'), 'Deck');
			await settlePreview();
			expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:preview:main']);
			expect(Object.keys(get(gameStore).cards ?? {})).toEqual([]);

			await spread(container);
			expect(Object.keys(get(gameStore).decks ?? {})).toEqual([]);
			expect(get(gameStore).cards!['card:preview:main-AS'].position).toEqual(spreadPositions);
		});

		it('falls back to Deck mode past the card cap', async () => {
			const pack: GamePackDef = {
				id: 'big',
				name: 'Big',
				scope: 'player',
				decks: [
					{
						slot: 'main',
						name: 'Main',
						back: CARD_BACK_DEFAULT,
						cards: Array.from({ length: SPREAD_MAX_CARDS + 1 }, (_, i) => ({
							code: `c${i}`,
							face: CARD_BACK_DEFAULT
						}))
					}
				]
			};
			localStorage.setItem('packs:v1', JSON.stringify({ big: { updatedAt: 1, pack } }));

			const container = await mount();
			await spread(container);
			button(container, 'Edit selected')!.click();
			await settlePreview();

			// piles, not 61 tiles — and the control follows the table
			expect(get(previewLayout)).toBe('deck');
			expect(Object.keys(get(gameStore).cards ?? {})).toEqual([]);
			expect(get(gameStore).decks?.['deck:preview:main'].cards).toHaveLength(SPREAD_MAX_CARDS + 1);
		});

		it('selects the clicked card in the pane', async () => {
			const container = await mount();
			await spread(container);
			button(container, 'Add card')!.click(); // cursor follows the new card
			await settlePreview();
			expect(input(container, 'Code')!.value).toBe('card-1');

			pickCard('card:preview:main-AS'); // what Card.svelte calls on a click
			await settle();
			expect(input(container, 'Code')!.value).toBe('AS');
		});

		it('ignores a click on a card no spread laid out', async () => {
			const container = await mount();
			await settlePreview(); // Deck mode: cards come off a pile by hand
			button(container, 'Add card')!.click();
			await settlePreview();

			pickCard('card:preview:main-AS');
			await settle();
			expect(input(container, 'Code')!.value).toBe('card-1'); // cursor unmoved
		});
	});

	describe('opening a pack file', () => {
		const OTHER: GamePackDef = {
			id: 'ember-duel',
			name: 'Ember Duel',
			scope: 'player',
			decks: [
				{
					slot: 'main',
					name: 'Main',
					back: 'https://example.com/back.png',
					cards: [{ code: 'strike', face: 'https://example.com/strike.png' }]
				}
			]
		};

		/** the hidden picker behind "Open a pack (.tbpp.json)" */
		async function openPackFile(container: HTMLElement) {
			const input = [...container.querySelectorAll('input[type=file]')].at(-1) as HTMLInputElement;
			Object.defineProperty(input, 'files', {
				value: [new File([serializePackFile(OTHER)], 'ember.tbpp.json')],
				configurable: true
			});
			input.dispatchEvent(new Event('change', { bubbles: true }));
			await settlePreview();
		}

		it('is reachable without expanding a folder', async () => {
			const container = await mount();
			// tweakpane keeps a collapsed folder's buttons in the DOM, so "visible"
			// has to mean "not inside a folder" — the bug was a folder, not display
			const open = button(container, 'Open a pack (.tbpp.json)')!;
			expect(open).toBeDefined();
			expect(open.closest('.tp-fldv')).toBeNull();
		});

		it('loads the pack into the editor and the library', async () => {
			const container = await mount();
			await openPackFile(container);

			expect(input(container, 'Id')!.value).toBe('ember-duel');
			expect(Object.keys(JSON.parse(localStorage.getItem('packs:v1') ?? '{}'))).toEqual([
				'ember-duel'
			]);
			expect(get(gameStore).decks?.['deck:preview:main'].cards).toHaveLength(1);
		});

		it('keeps an edited draft when the discard prompt is refused', async () => {
			const container = await mount();
			type(input(container, 'Name')!, 'Half Finished');
			await settlePreview();

			const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(false);
			await openPackFile(container);

			expect(confirmed).toHaveBeenCalled();
			expect(input(container, 'Id')!.value).toBe('my-pack'); // draft untouched
			// the file is not lost either — it is in the library, just not open
			expect(Object.keys(JSON.parse(localStorage.getItem('packs:v1') ?? '{}'))).toEqual([
				'ember-duel'
			]);
		});

		it('replaces the draft once the discard prompt is accepted', async () => {
			const container = await mount();
			type(input(container, 'Name')!, 'Half Finished');
			await settlePreview();

			vi.spyOn(window, 'confirm').mockReturnValue(true);
			await openPackFile(container);

			expect(input(container, 'Id')!.value).toBe('ember-duel');
		});

		it('does not prompt when the draft is untouched', async () => {
			const container = await mount();
			const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(false);
			await openPackFile(container);

			expect(confirmed).not.toHaveBeenCalled();
			expect(input(container, 'Id')!.value).toBe('ember-duel');
		});
	});

	it('previews only under the preview owner, leaving other entities alone', async () => {
		gameStore.set({
			players: {},
			decks: { 'deck:seat0:main': { id: 'deck:seat0:main', cards: [] } },
			cards: {},
			pieces: {}
		});
		const container = await mount();
		button(container, 'Add deck')!.click();
		await settlePreview();

		expect(get(gameStore).decks?.['deck:seat0:main']).toBeTruthy();
	});
});
