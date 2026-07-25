/**
 * Drives the real tweakpane controls in jsdom rather than calling the editor's
 * functions directly — that's what proves the pane is wired to the draft and
 * that the draft reaches the table as a live preview.
 *
 * Every test starts where a first-time author does: the start state, with no
 * draft at all. `startNew()` / `startWithCard()` press the same buttons a
 * person would to get past it.
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

// the Pane observes its own size; jsdom has no ResizeObserver
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
const cardList = (container: HTMLElement) =>
	[...container.querySelectorAll('select')].filter((s) =>
		[...s.options].some((o) => /^\d+: /.test(o.textContent ?? ''))
	)[1];

const cardCodes = (container: HTMLElement) =>
	[...(cardList(container)?.options ?? [])].map((o) => (o.textContent ?? '').replace(/^\d+: /, ''));

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

/** the editor as it first paints: the start state, no draft */
async function mount() {
	const { container } = render(CreatePane);
	await settle();
	return container;
}

/** past the start state: an empty pack with one empty deck */
async function startNew() {
	const container = await mount();
	button(container, 'New empty pack')!.click();
	await settle();
	return container;
}

/** …and one card in it, so there is something to select and preview */
async function startWithCard() {
	const container = await startNew();
	button(container, 'Add card')!.click();
	await settle();
	return container;
}

describe('CreatePane', () => {
	beforeEach(() => {
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });
		localStorage.clear();
		previewLayout.set('deck'); // module state: the last test's choice would leak
	});

	describe('the start state', () => {
		it('opens on a choice, not on a pack nobody authored', async () => {
			const container = await mount();
			await settlePreview();

			expect(button(container, 'New empty pack')).toBeTruthy();
			expect(button(container, 'Standard 52 template')).toBeTruthy();
			// no draft means no controls for one, and nothing on the table
			expect(button(container, 'Add card')).toBeUndefined();
			expect(get(gameStore).decks ?? {}).toEqual({});
		});

		it('offers the saved drafts only once there are some', async () => {
			expect(labels(await mount())).not.toContain('Continue');

			const pack: GamePackDef = {
				id: 'ember-duel',
				name: 'Ember Duel',
				scope: 'player',
				decks: [{ slot: 'main', name: 'Main', back: CARD_BACK_DEFAULT, cards: [] }]
			};
			localStorage.setItem('packs:v1', JSON.stringify({ 'ember-duel': { updatedAt: 1, pack } }));

			const container = await mount();
			expect(labels(container)).toContain('Continue');
			button(container, 'Open selected')!.click();
			await settle();
			expect(input(container, 'Id')!.value).toBe('ember-duel');
		});

		it('starts an empty pack with a deck to put cards in, and nothing else', async () => {
			const container = await startNew();
			await settlePreview();

			expect(input(container, 'Id')!.value).toBe('my-pack');
			// one deck to put cards in, and zero cards in it — an empty deck has no
			// pile to preview, so the table stays clear until the author adds one
			expect([...listWith(container, '0: main').options].map((o) => o.textContent)).toEqual([
				'0: main'
			]);
			expect(listWith(container, '(no cards)')).toBeTruthy();
			expect(get(gameStore).decks ?? {}).toEqual({});
		});

		it('starts from the standard 52 template when asked', async () => {
			const container = await mount();
			button(container, 'Standard 52 template')!.click();
			await settlePreview();

			expect(get(gameStore).decks?.['deck:preview:main'].cards).toHaveLength(52);
		});

		it('closes a pack back to the start state', async () => {
			const container = await startNew();
			button(container, 'Close pack')!.click();
			await settlePreview();

			expect(button(container, 'New empty pack')).toBeTruthy();
			expect(get(gameStore).decks ?? {}).toEqual({});
		});
	});

	it('previews the draft on the table as it is authored', async () => {
		await startWithCard();
		await settlePreview();

		const decks = get(gameStore).decks ?? {};
		expect(Object.keys(decks)).toEqual(['deck:preview:main']);
		expect(decks['deck:preview:main'].cards).toHaveLength(1);
	});

	it('adding a deck and a card updates the live preview', async () => {
		const container = await startWithCard();
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
		const container = await startNew();

		// the Board tab's kind list is the first offering "Counter"
		choose(listWith(container, 'Counter'), 'Counter');
		await settle();

		button(container, 'Add counter')!.click();
		await settlePreview();

		expect(labels(container)).toContain('Max value'); // counter-only control
		const pieces = Object.values(get(gameStore).pieces ?? {});
		expect(pieces).toHaveLength(1);
		expect(pieces[0]).toMatchObject({ kind: 'counter', value: 20, maxValue: 20 });
	});

	it('authors a multi-state token and previews the selected state', async () => {
		const container = await startNew();
		button(container, 'Add token')!.click(); // the kind list defaults to Token
		await settle();

		// three faces, each typed into the state's own face editor — the LAST
		// "Image URL" row on screen; the first is the piece's own image
		for (const face of ['https://x/lit.png', 'https://x/embers.png', 'https://x/out.png']) {
			button(container, 'Add state')!.click();
			await settle();
			const rows = inputs(container, 'Image URL');
			type(rows[rows.length - 1]!, face);
			await settle();
		}
		await settlePreview();

		// the pane survived: replacing a tweakpane blade tears the whole Pane
		// down, so the controls being gone is the failure this asserts against
		expect(button(container, 'Add state')).toBeTruthy();
		expect(labels(container)).toContain('State name');

		const piece = Object.values(get(gameStore).pieces ?? {})[0];
		expect(piece?.states?.map((s) => s.face)).toEqual([
			'https://x/lit.png',
			'https://x/embers.png',
			'https://x/out.png'
		]);
		// the state cursor is on the last one added, so that is what the table shows
		expect(piece?.state).toBe(2);

		// pick an earlier state and the preview follows
		const statePicker = [...container.querySelectorAll('select')].find((s) =>
			[...s.options].some((o) => o.textContent?.includes('State 1'))
		)!;
		choose(statePicker, 'State 1');
		await settlePreview();
		expect(Object.values(get(gameStore).pieces ?? {})[0]?.state).toBe(0);
	});

	it('authors a bag with contents, and previews it as a loaded bag', async () => {
		const container = await startNew();

		// Board tab → kind list → Bag (Token, Pawn, Counter, Dice, Bag)
		choose(listWith(container, 'Counter'), 'Bag');
		await settle();
		button(container, 'Add bag')!.click();
		await settle();

		// bag-only controls appear, and the pane is still standing (a blade swap
		// in a tweakpane Pane silently destroys the whole thing — see
		// tweakpane landmines in BulkSheet.svelte)
		expect(labels(container)).toContain('Draw order');
		expect(labels(container)).toContain('Infinite');
		expect(button(container, 'Add token to bag')).toBeTruthy();

		// fill it: a token, then a card, then switch the draw order
		button(container, 'Add token to bag')!.click();
		await settle();
		choose(listWith(container, 'Card'), 'Card');
		await settle();
		button(container, 'Add card to bag')!.click();
		await settle();

		// the card item swaps in its own fields, and the pane survives that too
		expect(labels(container)).toContain('Code');
		expect(button(container, 'Remove item')).toBeTruthy();

		choose(listWith(container, 'LIFO'), 'LIFO');
		await settlePreview();

		const bag = Object.values(get(gameStore).pieces ?? {}).find((p) => p?.kind === 'bag');
		expect(bag).toMatchObject({ kind: 'bag', drawMode: 'lifo' });
		expect(bag?.contents?.map((item) => item.kind)).toEqual(['token', 'card']);
	});

	it('saves the pack to the library (packs:v1) and re-opens it for editing', async () => {
		const container = await startWithCard();
		button(container, 'Save to library')!.click();
		await settle();

		const stored = JSON.parse(localStorage.getItem('packs:v1') ?? '{}');
		expect(Object.keys(stored)).toEqual(['my-pack']);
		expect(stored['my-pack'].pack.decks[0].cards[0].face).toBe(CARD_BACK_DEFAULT);

		button(container, 'Edit selected')!.click();
		await settlePreview();
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:preview:main']);
	});

	it('does not preview a deck that has no cards yet', async () => {
		const container = await startWithCard();
		button(container, 'Add deck')!.click(); // new decks start empty
		await settlePreview();

		// an empty deck has no cards[0] for Deck.svelte to render
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:preview:main']);
	});

	it('gives a new card the deck back as its face, so it renders immediately', async () => {
		const container = await startNew();
		button(container, 'Add card')!.click();
		await settlePreview();

		const cards = get(gameStore).decks?.['deck:preview:main'].cards ?? [];
		expect(cards).toHaveLength(1);
		// the deck's back — a blank face resolves to '' and shows nothing
		expect(cards[0].faceImageUrl).toBe(CARD_BACK_DEFAULT);
	});

	it('gives every card a distinct code — duplicating twice never repeats one', async () => {
		const container = await startWithCard();
		// `code` is the entity-id component, so a repeat would collapse two cards
		// into one table entity
		button(container, 'Duplicate card')!.click();
		await settle();
		expect(cardCodes(container)).toEqual(['card-0', 'card-1']);

		button(container, 'Duplicate card')!.click();
		await settle();
		expect(cardCodes(container)).toEqual(['card-0', 'card-1', 'card-2']);
	});

	it('does not reuse a `card-N` code after a card is removed', async () => {
		const container = await startNew();
		button(container, 'Add card')!.click(); // card-0
		await settle();
		button(container, 'Add card')!.click(); // card-1
		await settle();

		// remove the FIRST one: `card-${cards.length}` is now `card-1`, and that
		// is still in use — the old code minted the collision, this steps past it
		choose(cardList(container), '0: card-0');
		await settle();
		button(container, 'Remove card')!.click();
		await settle();
		button(container, 'Add card')!.click();
		await settle();

		const codes = cardCodes(container);
		expect(codes).toEqual(['card-1', 'card-2']);
	});

	it('bulk-adds a sheet grid into the selected deck, from the Cards tab', async () => {
		const container = await startWithCard();

		// closed until asked for: it used to sit open over the felt before anyone
		// had a sheet URL
		expect(labels(container)).not.toContain('Sheet URL');
		button(container, 'Add cards from a sheet…')!.click();
		await settle();

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
		expect(cards).toHaveLength(5); // the first card plus the grid
		expect(
			cards.slice(1).map((c) => JSON.parse(c.faceImageUrl!.slice('sheet:'.length)).index)
		).toEqual([0, 1, 2, 3]);
		expect(cardCodes(container)).toEqual(['card-0', 'card-1', 'card-2', 'card-3', 'card-4']);
	});

	it('sets the selected card face inline, without a separate builder', async () => {
		const container = await startWithCard();
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
		const container = await startWithCard();
		choose(schemePickers(container)[0], 'Image URL');
		await settle();
		type(input(container, 'Image URL')!, 'https://example.test/back.png');
		await settlePreview();

		expect(get(gameStore).decks?.['deck:preview:main'].deckBackImageUrl).toBe(
			'https://example.test/back.png'
		);
	});

	it('flips the cards on the preview table from the pane, no keyboard needed', async () => {
		const container = await startWithCard();
		await settlePreview();

		gameStore.updateState({
			cards: {
				'card:preview:main-card-0': {
					position: [0, 0.3, 0],
					rotation: [180, 0, 0], // as it arrives off a facedown pile
					faceImageUrl: CARD_BACK_DEFAULT
				}
			}
		});
		button(container, 'Flip cards on table')!.click();
		await settle();

		expect(get(gameStore).cards?.['card:preview:main-card-0'].rotation).toEqual([0, 0, 0]);
	});

	describe('Spread layout', () => {
		/** switch the preview to Spread through the real pane control */
		async function spread(container: HTMLElement) {
			choose(listWith(container, 'Spread'), 'Spread');
			await settlePreview();
		}

		it('lays every card of every deck out face-up, with no piles left', async () => {
			const container = await startWithCard();
			button(container, 'Add deck')!.click();
			await settle();
			button(container, 'Add card')!.click();
			await settle();
			await spread(container);

			const state = get(gameStore);
			expect(Object.keys(state.decks ?? {})).toEqual([]);
			expect(Object.keys(state.cards ?? {}).sort()).toEqual([
				'card:preview:deck-1-card-0',
				'card:preview:main-card-0'
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
			const container = await startWithCard();
			await spread(container);
			const before = get(gameStore).cards!['card:preview:main-card-0'].position;

			button(container, 'Add card')!.click();
			await settlePreview();

			const cards = get(gameStore).cards!;
			expect(Object.keys(cards)).toHaveLength(2);
			expect(cards['card:preview:main-card-0'].position).toEqual(before);
			// the new card is appended one column across, not re-laid out
			expect(cards['card:preview:main-card-1'].position![0] - before![0]).toBeCloseTo(
				SPREAD_PITCH_X
			);

			// third Name row: pack, deck, then the selected card (DOM order) — the
			// draft check below is what proves it was the card's
			type(inputs(container, 'Name')[2]!, 'renamed');
			await settlePreview();
			expect(get(gameStore).cards!['card:preview:main-card-0'].position).toEqual(before);
			expect(cards['card:preview:main-card-1'].position).toEqual(
				get(gameStore).cards!['card:preview:main-card-1'].position
			);

			button(container, 'Save to library')!.click();
			await settle();
			const saved = JSON.parse(localStorage.getItem('packs:v1') ?? '{}');
			expect(saved['my-pack'].pack.decks[0].cards[1].name).toBe('renamed');
		});

		it('re-forms the piles when switched back to Deck', async () => {
			const container = await startWithCard();
			await spread(container);
			const spreadPositions = get(gameStore).cards!['card:preview:main-card-0'].position;

			choose(listWith(container, 'Spread'), 'Deck');
			await settlePreview();
			expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:preview:main']);
			expect(Object.keys(get(gameStore).cards ?? {})).toEqual([]);

			await spread(container);
			expect(Object.keys(get(gameStore).decks ?? {})).toEqual([]);
			expect(get(gameStore).cards!['card:preview:main-card-0'].position).toEqual(spreadPositions);
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
			previewLayout.set('spread'); // as it is remembered from the last session
			button(container, 'Open selected')!.click();
			await settlePreview();

			// piles, not 61 tiles — and the control follows the table
			expect(get(previewLayout)).toBe('deck');
			expect(Object.keys(get(gameStore).cards ?? {})).toEqual([]);
			expect(get(gameStore).decks?.['deck:preview:main'].cards).toHaveLength(SPREAD_MAX_CARDS + 1);
		});

		it('selects the clicked card in the pane', async () => {
			const container = await startWithCard();
			await spread(container);
			button(container, 'Add card')!.click(); // cursor follows the new card
			await settlePreview();
			expect(input(container, 'Code')!.value).toBe('card-1');

			pickCard('card:preview:main-card-0'); // what Card.svelte calls on a click
			await settle();
			expect(input(container, 'Code')!.value).toBe('card-0');
		});

		it('ignores a click on a card no spread laid out', async () => {
			const container = await startWithCard();
			await settlePreview(); // Deck mode: cards come off a pile by hand
			button(container, 'Add card')!.click();
			await settlePreview();

			pickCard('card:preview:main-card-0');
			await settle();
			expect(input(container, 'Code')!.value).toBe('card-1'); // cursor unmoved
		});
	});

	describe('opening a file', () => {
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

		/** drop a file on the File blade's zone (the last one mounted) */
		async function drop(container: HTMLElement, file: File) {
			const picker = [...container.querySelectorAll('input[type=file]')].at(-1) as HTMLInputElement;
			Object.defineProperty(picker, 'files', { value: [file], configurable: true });
			picker.dispatchEvent(new Event('change', { bubbles: true }));
			await settlePreview();
		}

		const packFile = () => new File([serializePackFile(OTHER)], 'ember.tbpp.json');

		it('is reachable without expanding a folder, from the start state and the editor', async () => {
			const container = await mount();
			// tweakpane keeps a collapsed folder's controls in the DOM, so "visible"
			// has to mean "not inside a folder" — the bug was a folder, not display
			const start = container.querySelector('input[type=file]');
			expect(start).toBeTruthy();
			expect(start!.closest('.tp-fldv')).toBeNull();

			button(container, 'New empty pack')!.click();
			await settle();
			const editor = container.querySelector('input[type=file]');
			expect(editor).toBeTruthy();
			expect(editor!.closest('.tp-fldv')).toBeNull();
		});

		it('opens a pack straight from the start state', async () => {
			const container = await mount();
			await drop(container, packFile());

			expect(input(container, 'Id')!.value).toBe('ember-duel');
			expect(Object.keys(JSON.parse(localStorage.getItem('packs:v1') ?? '{}'))).toEqual([
				'ember-duel'
			]);
			expect(get(gameStore).decks?.['deck:preview:main'].cards).toHaveLength(1);
		});

		it('routes a TTS save through the same drop zone', async () => {
			const tts = {
				ObjectStates: [
					{
						Name: 'DeckCustom',
						Nickname: 'Troopers',
						DeckIDs: [100, 101],
						CustomDeck: {
							'1': {
								FaceURL: 'https://example.com/face.png',
								BackURL: 'https://example.com/back.png',
								NumWidth: 2,
								NumHeight: 1
							}
						}
					}
				]
			};
			const container = await mount();
			await drop(container, new File([JSON.stringify(tts)], 'save.json'));

			// the deck's slot is slugified from its TTS nickname
			expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:preview:troopers']);
			expect(get(gameStore).decks!['deck:preview:troopers'].cards).toHaveLength(2);
		});

		it('keeps an edited draft when the discard prompt is refused', async () => {
			const container = await startNew();
			type(input(container, 'Name')!, 'Half Finished');
			await settlePreview();

			const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(false);
			await drop(container, packFile());

			expect(confirmed).toHaveBeenCalled();
			expect(input(container, 'Id')!.value).toBe('my-pack'); // draft untouched
			// the file is not lost either — it is in the library, just not open
			expect(Object.keys(JSON.parse(localStorage.getItem('packs:v1') ?? '{}'))).toEqual([
				'ember-duel'
			]);
		});

		it('replaces the draft once the discard prompt is accepted', async () => {
			const container = await startNew();
			type(input(container, 'Name')!, 'Half Finished');
			await settlePreview();

			vi.spyOn(window, 'confirm').mockReturnValue(true);
			await drop(container, packFile());

			expect(input(container, 'Id')!.value).toBe('ember-duel');
		});

		it('does not prompt when the draft is untouched', async () => {
			const container = await startNew();
			const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(false);
			await drop(container, packFile());

			expect(confirmed).not.toHaveBeenCalled();
			expect(input(container, 'Id')!.value).toBe('ember-duel');
		});
	});

	it('keeps Save and Export out of any folder, one tab from anywhere', async () => {
		const container = await startNew();
		for (const title of ['Save to library', 'Export pack']) {
			const control = button(container, title)!;
			expect(control).toBeDefined();
			expect(control.closest('.tp-fldv')).toBeNull();
		}
	});

	describe('the column below the pane', () => {
		const status = (container: HTMLElement) =>
			container.querySelector('footer')?.textContent?.trim();

		it('says what is in the draft, on every tab', async () => {
			const container = await mount();
			// the start state has no draft to count, and still closes the column
			expect(status(container)).toBe('no pack open');

			button(container, 'New empty pack')!.click();
			await settle();
			expect(status(container)).toBe('1 deck · 0 cards');

			button(container, 'Add card')!.click();
			await settle();
			button(container, 'Add deck')!.click();
			await settle();
			expect(status(container)).toBe('2 decks · 1 card');

			// pieces and overlays only once the pack has any — a deck of cards
			// should not have to read past zeroes
			choose(listWith(container, 'Counter'), 'Counter');
			await settle();
			button(container, 'Add counter')!.click();
			await settle();
			expect(status(container)).toBe('2 decks · 1 card · 1 piece');
		});

		it('carries the help the tabs no longer do, outside every folder', async () => {
			const container = await startNew();
			const help = container.querySelector('section');
			expect(help?.textContent).toContain('A pack is a content library');
			expect(help?.textContent).toContain('Preview table');
			// it is markup, not a blade: a tweakpane folder would collapse it back
			// into the pane it was moved out of
			expect(help?.closest('.tp-fldv')).toBeNull();
		});
	});

	it('previews only under the preview owner, leaving other entities alone', async () => {
		gameStore.set({
			players: {},
			decks: { 'deck:seat0:main': { id: 'deck:seat0:main', cards: [] } },
			cards: {},
			pieces: {}
		});
		const container = await startNew();
		button(container, 'Add deck')!.click();
		await settlePreview();

		expect(get(gameStore).decks?.['deck:seat0:main']).toBeTruthy();
	});
});
