/**
 * The drop gesture itself: the zone hands over dropped files (and only files),
 * and a bad one produces the parser's own message as a toast rather than a
 * console error — a drop is a user action, so its failures belong on screen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import toast from 'svelte-french-toast';
import FileDropZone from '../FileDropZone.svelte';
import { openDroppedFile } from '../drop';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { serializePackFile } from '$lib/packs/file';
import { getLibraryPack } from '$lib/packs/library';
import type { GamePackDef } from '$lib/packs/types';

const PACK: GamePackDef = {
	id: 'dropped',
	name: 'Dropped Pack',
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

/** jsdom has no DataTransfer — a drag is only its `types` and `files` here */
function dragEvent(type: string, files: File[], types = ['Files']) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'dataTransfer', { value: { types, files } });
	return event;
}

const packFile = () => new File([serializePackFile(PACK)], 'dropped.tbpp.json');

describe('FileDropZone', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });
	});

	it('hands a dropped file to its handler', async () => {
		const onfile = vi.fn();
		render(FileDropZone, { props: { onfile } });

		window.dispatchEvent(dragEvent('drop', [packFile()]));
		expect(onfile).toHaveBeenCalledTimes(1);
		expect((onfile.mock.calls[0][0] as File).name).toBe('dropped.tbpp.json');
	});

	it('ignores a drag that carries no files', async () => {
		const onfile = vi.fn();
		render(FileDropZone, { props: { onfile } });

		window.dispatchEvent(dragEvent('drop', [], ['text/plain']));
		expect(onfile).not.toHaveBeenCalled();
	});

	it('shows the hint while files are dragged over the table', async () => {
		const { container } = render(FileDropZone, { props: { onfile: () => {} } });
		expect(container.textContent).not.toContain('.tbpp.json');

		window.dispatchEvent(dragEvent('dragover', [packFile()]));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(container.textContent).toContain('.tbpp.json');
	});
});

describe('openDroppedFile', () => {
	beforeEach(() => {
		localStorage.clear();
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });
		vi.restoreAllMocks();
	});

	it('opens a pack into both the library and the table', async () => {
		const opened = await openDroppedFile(packFile(), { ownerId: 'seat0' });

		expect(opened?.kind).toBe('pack');
		expect(getLibraryPack('dropped')).toBeDefined();
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:seat0:main']);
	});

	it('toasts the parser’s field-level message for a corrupt pack', async () => {
		const error = vi.spyOn(toast, 'error').mockImplementation(() => '');
		const broken = JSON.stringify({ ...PACK, tbpp: 1, decks: [{ slot: 'main' }] });

		const opened = await openDroppedFile(new File([broken], 'broken.tbpp.json'));

		expect(opened).toBeUndefined();
		expect(error).toHaveBeenCalledTimes(1);
		expect(String(error.mock.calls[0][0])).toMatch(/decks\[0\]\.name/);
		expect(get(gameStore).decks ?? {}).toEqual({});
	});

	it('toasts a file of no known format instead of throwing', async () => {
		const error = vi.spyOn(toast, 'error').mockImplementation(() => '');

		await openDroppedFile(new File(['{"hello":"world"}'], 'other.json'));

		expect(String(error.mock.calls[0][0])).toMatch(/tbpp/);
	});
});
