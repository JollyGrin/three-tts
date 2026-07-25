/**
 * The scenario editor's own pane, mounted for real in jsdom. Two things it
 * guards: the library controls survive being nested in the Seats folder (a
 * blade that tears down takes the WHOLE pane with it — see BulkSheet.svelte's
 * note), and "spawn for the seat I'm editing" wires the seat through, so the
 * same pack can be laid out for both sides without re-picking a file (#93).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import SetupPane from '../SetupPane.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { saveLibraryPack } from '$lib/packs/library';
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
});
