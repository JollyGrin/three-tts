/**
 * Dropping a file on the table: what it IS decides what happens to it, read
 * from the in-band discriminator rather than the name, because files get
 * renamed and piped (docs/packs.md). A pack joins the library and spawns; a
 * scenario is saved and loaded; anything else fails with a message a person
 * can act on rather than a console error.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { serializePackFile } from '$lib/packs/file';
import { getLibraryPack } from '$lib/packs/library';
import { STANDARD_52 } from '$lib/packs/standard52';
import { serializeScenarioFile } from '$lib/scenario/file';
import { ensureSeatPlaceholder, getScenario, saveScenario } from '$lib/scenario/scenario';
import { spawnPackDeck } from '$lib/packs/spawn';
import type { GamePackDef } from '$lib/packs/types';
import { openTableFile, parseTableFile } from '../table-file';

const emptyTable = () =>
	gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });

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

/** a scenario file with content, built the way /setup builds one */
function scenarioText(name = 'dropped-scenario'): string {
	emptyTable();
	ensureSeatPlaceholder(0);
	spawnPackDeck(STANDARD_52, STANDARD_52.decks[0], {
		ownerId: 'seat0',
		order: ['AS', '2C'],
		position: [1, 0.4, 2]
	});
	const text = serializeScenarioFile(saveScenario(name));
	emptyTable();
	localStorage.removeItem('scenarios:v1');
	return text;
}

describe('routing a file by its discriminator', () => {
	beforeEach(() => {
		localStorage.clear();
		emptyTable();
	});

	it('reads a tbpp file as a pack', () => {
		const file = parseTableFile(serializePackFile(PACK));
		expect(file).toMatchObject({ kind: 'pack', pack: { id: 'dropped' } });
	});

	it('reads a tbps file as a scenario', () => {
		const file = parseTableFile(scenarioText());
		expect(file).toMatchObject({ kind: 'scenario', scenario: { name: 'dropped-scenario' } });
	});

	it('reads a legacy v0 scenario, which predates the discriminator', () => {
		const file = parseTableFile(JSON.stringify({ name: 'legacy', createdAt: 1, state: {} }));
		expect(file.kind).toBe('scenario');
	});

	it('gives the pack parser’s field-level message for a corrupt pack', () => {
		const broken = JSON.stringify({ ...PACK, tbpp: 1, decks: [{ ...PACK.decks[0], cards: [{}] }] });
		expect(() => parseTableFile(broken)).toThrow(/decks\[0\]\.cards\[0\]\.code/);
	});

	it('names the marker it wanted for a json file of some other kind', () => {
		expect(() => parseTableFile(JSON.stringify({ hello: 'world' }))).toThrow(/tbpp.*tbps/s);
	});

	it('rejects a file that is not json at all', () => {
		expect(() => parseTableFile('<html></html>')).toThrow(/Not valid JSON/);
	});
});

describe('opening a dropped file', () => {
	beforeEach(() => {
		localStorage.clear();
		emptyTable();
	});

	it('files a pack in the library and spawns it for the given owner', async () => {
		ensureSeatPlaceholder(1);
		const opened = await openTableFile(serializePackFile(PACK), { ownerId: 'seat1' });

		expect(opened.kind).toBe('pack');
		expect(getLibraryPack('dropped')?.pack.name).toBe('Dropped Pack');
		expect(Object.keys(get(gameStore).decks ?? {})).toEqual(['deck:seat1:main']);
		// stamped local, so a scenario saved from here reloads
		expect(get(gameStore).decks?.['deck:seat1:main']?.packOrigin?.source).toBe('local');
	});

	it('saves a scenario and loads it onto the table', async () => {
		const opened = await openTableFile(scenarioText());

		expect(opened.kind).toBe('scenario');
		expect(getScenario('dropped-scenario')).toBeDefined();
		expect(get(gameStore).decks?.['deck:seat0:main']?.cards).toHaveLength(2);
	});

	it('still stores a pack when the caller takes it instead of spawning it', async () => {
		let taken: GamePackDef | undefined;
		await openTableFile(serializePackFile(PACK), { onPack: (pack) => (taken = pack) });

		expect(taken?.id).toBe('dropped');
		expect(getLibraryPack('dropped')).toBeDefined();
		expect(get(gameStore).decks ?? {}).toEqual({});
	});

	it('still stores a scenario when the caller takes it instead of loading it', async () => {
		await openTableFile(scenarioText(), { onScenario: () => {} });

		expect(getScenario('dropped-scenario')).toBeDefined();
		expect(get(gameStore).decks ?? {}).toEqual({});
	});
});
