/**
 * The library controls /setup and /play both mount: pick a pack, spawn it, or
 * open a `.tbpp.json` (which files it in the library and spawns it in one
 * gesture). Driven through the real tweakpane blades in jsdom, because "the
 * control exists and is wired" is the thing that was missing (#93 §2).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import PackLibrary from '../PackLibrary.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { saveLibraryPack, listLibraryPacks } from '../library';
import { serializePackFile } from '../file';
import type { GamePackDef } from '../types';

// the draggable Pane observes its own size; jsdom has no ResizeObserver
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

/** tweakpane renders asynchronously; let its microtasks flush */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const button = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

const options = (container: HTMLElement) =>
	[...(container.querySelector('select')?.options ?? [])].map((o) => o.textContent);

function pack(id: string, name = id): GamePackDef {
	return {
		id,
		name,
		scope: 'player',
		decks: [
			{
				slot: 'main',
				name: 'Main',
				back: 'https://example.com/back.png',
				cards: [{ code: 'a', face: 'https://example.com/a.png' }]
			}
		]
	};
}

const emptyTable = () =>
	gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });

describe('PackLibrary', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		emptyTable();
		vi.restoreAllMocks();
	});

	it('lists what is in the library and spawns the selection for the given owner', async () => {
		saveLibraryPack(pack('ember-duel', 'Ember Duel'));
		const { container } = render(PackLibrary, {
			props: { ownerId: 'seat1', spawnTitle: 'Spawn selected for seat 1' }
		});
		await settle();

		expect(options(container)).toEqual(['ember-duel']);
		await fireEvent.click(button(container, 'Spawn selected for seat 1')!);

		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:seat1:main']);
		expect(get(gameStore).decks?.['deck:seat1:main']?.packOrigin).toEqual({
			pack: 'ember-duel',
			content: 'main',
			source: 'local'
		});
	});

	it('spawns for the local player when no owner is given — the /play case', async () => {
		localStorage.setItem('myPlayerId', 'player9');
		gameActions.addPlayer('player9');
		saveLibraryPack(pack('ember-duel'));
		const { container } = render(PackLibrary);
		await settle();

		await fireEvent.click(button(container, 'Spawn selected')!);
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:player9:main']);
	});

	it('opening a pack file saves it to the library and spawns it', async () => {
		const { container } = render(PackLibrary, { props: { ownerId: 'seat0' } });
		await settle();
		expect(options(container)).toEqual(['(no packs yet)']);

		const input = container.querySelector('input[type=file]') as HTMLInputElement;
		const file = new File([serializePackFile(pack('ember-duel', 'Ember Duel'))], 'e.tbpp.json');
		Object.defineProperty(input, 'files', { value: [file] });
		await fireEvent.change(input);
		await settle();

		expect(listLibraryPacks().map((entry) => entry.pack.id)).toEqual(['ember-duel']);
		expect(options(container)).toEqual(['ember-duel']);
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:seat0:main']);
	});

	it('leaves the table alone when the file is not a pack', async () => {
		const { container } = render(PackLibrary, { props: { ownerId: 'seat0' } });
		await settle();

		const input = container.querySelector('input[type=file]') as HTMLInputElement;
		Object.defineProperty(input, 'files', {
			value: [new File([JSON.stringify({ hello: 'world' })], 'nope.json')]
		});
		await fireEvent.change(input);
		await settle();

		expect(listLibraryPacks()).toEqual([]);
		expect(get(gameStore).decks ?? {}).toEqual({});
	});

	it('spawns nothing when the library is empty', async () => {
		const { container } = render(PackLibrary, { props: { ownerId: 'seat0' } });
		await settle();

		await fireEvent.click(button(container, 'Spawn selected')!);
		expect(get(gameStore).decks ?? {}).toEqual({});
	});
});
