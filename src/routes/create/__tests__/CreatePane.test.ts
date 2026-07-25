/**
 * Drives the real tweakpane controls in jsdom rather than calling the editor's
 * functions directly — that's what proves the pane is wired to the draft and
 * that the draft reaches the table as a live preview.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import CreatePane from '../CreatePane.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { CARD_BACK_DEFAULT } from '$lib/packs/standard52';

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

/** the text input of the (single) row carrying this label */
const input = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('.tp-lblv_l')]
		.find((el) => el.textContent === label)
		?.parentElement?.querySelector('input');

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

	it('saves a draft to packs:v1 and reloads it', async () => {
		const container = await mount();
		button(container, 'Save draft')!.click();
		await settle();

		const stored = JSON.parse(localStorage.getItem('packs:v1') ?? '{}');
		expect(Object.keys(stored)).toEqual(['my-pack']);
		expect(stored['my-pack'].pack.decks[0].cards[0].face).toBe('gen:std52/AS');

		button(container, 'Load selected')!.click();
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
