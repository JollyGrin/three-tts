/**
 * The scenario editor's own pane, mounted for real in jsdom. Two things it
 * guards: the library controls survive being nested in the Seats folder (a
 * blade that tears down takes the WHOLE pane with it — see BulkSheet.svelte's
 * note), and "spawn for the seat I'm editing" wires the seat through, so the
 * same pack can be laid out for both sides without re-picking a file (#93).
 *
 * Plus the two #114 fixes: seat selection and the Decks tab strip are one
 * selection expressed two ways, and the irreversible buttons need a second
 * click.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import SetupPane from '../SetupPane.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { selectedDeckId } from '$lib/store/deckSelection';
import { saveLibraryPack } from '$lib/packs/library';
import { saveScenario, listScenarios } from '$lib/scenario/scenario';
import type { GamePackDef } from '$lib/packs/types';

// jsdom has neither observer; the draggable Pane needs one and tweakpane's
// Wheel blade (camerakit) needs the other
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
} as unknown as typeof IntersectionObserver;

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const button = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

const listWith = (container: HTMLElement, option: string) =>
	[...container.querySelectorAll('select')].find((s) =>
		[...s.options].some((o) => o.textContent?.includes(option))
	)!;

const PACK: GamePackDef = {
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

describe('SetupPane', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });
	});

	it('offers the library and the file opener beside the builtin spawn', async () => {
		const { container } = render(SetupPane);
		await settle();

		expect(button(container, 'Spawn selected for seat 0')).toBeDefined();
		expect(button(container, 'Open a pack (.tbpp.json)')).toBeDefined();
		// the rest of the pane is still standing (a torn-down blade takes it all)
		expect(button(container, 'Save scenario')).toBeDefined();
		expect(button(container, 'Clear table')).toBeDefined();
	});

	it('spawns the selected pack for the seat being edited', async () => {
		saveLibraryPack(PACK);
		const { container } = render(SetupPane);
		await settle();

		const seats = listWith(container, 'Seat 1 (far)');
		seats.selectedIndex = 1;
		seats.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();

		await fireEvent.click(button(container, 'Spawn selected for seat 1')!);

		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:seat1:main']);
		// the placeholder that will own it is seated first, or the scenario would
		// save a deck belonging to nobody
		expect(get(gameStore).players?.seat1?.seat).toBe(1);
	});

	it('explains itself in prose, not in a disabled Textarea', async () => {
		const { container } = render(SetupPane);
		await settle();

		// #115: the six-row disabled scroll box is gone, and its copy survived the
		// move into real markup behind the "How this works" folder
		expect(container.querySelector('textarea')).toBeNull();
		expect([...container.querySelectorAll('input')].filter((i) => i.disabled)).toHaveLength(0);
		expect(container.textContent).toContain('Everything here is local');
		expect(container.textContent).toContain('cards in your hand tray are not saved');
	});
});

/** two decks on the table, one per seat — the state #114 was reported against */
function twoSeatsWithDecks() {
	gameStore.set({
		players: {
			seat0: { id: 'seat0', seat: 0, joinTimestamp: 0, tray: {}, metadata: {} },
			seat1: { id: 'seat1', seat: 1, joinTimestamp: 0, tray: {}, metadata: {} }
		},
		cards: {},
		decks: {
			'deck:seat0:main': { id: 'deck:seat0:main', cards: [], position: [8.5, 0.4, 4.5] },
			'deck:seat1:main': { id: 'deck:seat1:main', cards: [], position: [8.5, 0.4, -4.7] }
		},
		pieces: {},
		overlays: {}
	} as unknown as Parameters<typeof gameStore.set>[0]);
}

/** tweakpane renders tab titles into their own buttons */
const tab = (container: HTMLElement, title: string) =>
	[...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === title);

/** …and marks the active one `tp-tbiv-sel` — tweakpane's own idea of selected */
const selectedTabTitle = (container: HTMLElement) =>
	container.querySelector('.tp-tbiv-sel')?.textContent?.trim();

describe('SetupPane — seat and deck tab are one selection (#114)', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });
		selectedDeckId.set(null);
	});

	it('follows the seat when a deck tab is clicked', async () => {
		twoSeatsWithDecks();
		const { container } = render(SetupPane);
		await settle();

		// the strip opens on the seat being edited
		expect(get(selectedDeckId)).toBe('deck:seat0:main');
		expect(button(container, 'View table from seat 0')).toBeDefined();

		await fireEvent.click(tab(container, 'seat1 main')!);
		await settle();

		expect(get(selectedDeckId)).toBe('deck:seat1:main');
		// every "for seat N" button now agrees with the tab
		expect(button(container, 'View table from seat 1')).toBeDefined();
		expect(button(container, 'Spawn selected for seat 1')).toBeDefined();
	});

	it('moves the tab strip when the seat is changed', async () => {
		twoSeatsWithDecks();
		const { container } = render(SetupPane);
		await settle();

		const seats = listWith(container, 'Seat 1 (far)');
		seats.selectedIndex = 1;
		seats.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();

		expect(get(selectedDeckId)).toBe('deck:seat1:main');
		expect(selectedTabTitle(container)).toBe('seat1 main');
		// and the pane is still standing
		expect(button(container, 'Clear table')).toBeDefined();
	});

	it('keeps pointing at the same deck when another one spawns', async () => {
		twoSeatsWithDecks();
		const { container } = render(SetupPane);
		await settle();

		await fireEvent.click(tab(container, 'seat1 main')!);
		await settle();

		gameStore.updateState({
			decks: { 'deck:seat0:discard': { id: 'deck:seat0:discard', cards: [] } }
		} as unknown as Parameters<typeof gameStore.updateState>[0]);
		await settle();

		// the index shifted under the strip; the SELECTION did not
		expect(get(selectedDeckId)).toBe('deck:seat1:main');
		expect(button(container, 'View table from seat 1')).toBeDefined();
	});

	it('stays on the seat a deck was just spawned for, strip included', async () => {
		saveLibraryPack(PACK);
		const { container } = render(SetupPane);
		await settle();

		await fireEvent.click(button(container, 'Spawn selected for seat 0')!);
		await settle();

		const seats = listWith(container, 'Seat 1 (far)');
		seats.selectedIndex = 1;
		seats.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();
		await fireEvent.click(button(container, 'Spawn selected for seat 1')!);
		await settle();

		// the seat you spawned for stays put — it used to snap back to seat 0
		expect(button(container, 'View table from seat 1')).toBeDefined();
		expect(get(selectedDeckId)).toBe('deck:seat1:main');
		// and tweakpane's own cursor agrees with the outline on the table: the
		// selected page is the only one whose controls are visible
		expect(selectedTabTitle(container)).toBe('seat1 main');
	});

	it('stops highlighting once the editor is gone', async () => {
		twoSeatsWithDecks();
		const { unmount } = render(SetupPane);
		await settle();
		expect(get(selectedDeckId)).toBe('deck:seat0:main');

		unmount();
		await settle();

		expect(get(selectedDeckId)).toBeNull();
	});
});

describe('SetupPane — the irreversible buttons ask twice (#114)', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });
		selectedDeckId.set(null);
	});

	it('arms Clear table before wiping a non-empty table', async () => {
		twoSeatsWithDecks();
		const { container } = render(SetupPane);
		await settle();

		await fireEvent.click(button(container, 'Clear table')!);
		await settle();

		// nothing gone yet, and there is a way back
		expect(Object.values(get(gameStore).decks ?? {}).filter(Boolean)).toHaveLength(2);
		expect(button(container, 'Leave it alone')).toBeDefined();

		await fireEvent.click(button(container, 'Really clear the whole table?')!);
		await settle();

		expect(Object.values(get(gameStore).decks ?? {}).filter(Boolean)).toHaveLength(0);
		// disarmed again, and the pane survived both blades coming and going
		expect(button(container, 'Leave it alone')).toBeUndefined();
		expect(button(container, 'Clear table')).toBeDefined();
		expect(button(container, 'Save scenario')).toBeDefined();
	});

	it('cancels an armed Clear table', async () => {
		twoSeatsWithDecks();
		const { container } = render(SetupPane);
		await settle();

		await fireEvent.click(button(container, 'Clear table')!);
		await settle();
		await fireEvent.click(button(container, 'Leave it alone')!);
		await settle();

		expect(Object.values(get(gameStore).decks ?? {}).filter(Boolean)).toHaveLength(2);
		expect(button(container, 'Clear table')).toBeDefined();
	});

	it('does not bother asking when the table is already empty', async () => {
		const { container } = render(SetupPane);
		await settle();

		await fireEvent.click(button(container, 'Clear table')!);
		await settle();

		expect(button(container, 'Really clear the whole table?')).toBeUndefined();
	});

	it('arms Delete selected before dropping a saved scenario', async () => {
		twoSeatsWithDecks();
		saveScenario('keeper');
		const { container } = render(SetupPane);
		await settle();

		await fireEvent.click(button(container, 'Delete selected')!);
		await settle();
		expect(listScenarios().map((s) => s.name)).toEqual(['keeper']);

		await fireEvent.click(button(container, 'Really delete "keeper"?')!);
		await settle();

		expect(listScenarios()).toEqual([]);
		expect(button(container, 'Delete selected')).toBeDefined();
		expect(button(container, 'Clear table')).toBeDefined();
	});
});
