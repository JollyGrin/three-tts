/**
 * The bug this file exists for: a pack imported from disk could not survive a
 * scenario save/load. It carried no `source`, so `saveScenario` wrote a bare
 * ref and the loader reported `no builtin pack 'x' and no source url` — every
 * placement from your own content was skipped.
 *
 * table.place hosts nothing, so "your own pack" is the normal case, not an
 * edge one. What has to hold now: an opened pack joins the local library, the
 * scenario ref says `source: 'local'`, the load resolves it out of
 * localStorage, and a pack that genuinely isn't there still fails loudly by id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { STANDARD_52 } from '$lib/packs/standard52';
import { spawnPack } from '$lib/packs/spawn';
import { serializePackFile } from '$lib/packs/file';
import { getLibraryPack, listLibraryPacks, saveLibraryPack } from '$lib/packs/library';
import { openTableFile } from '$lib/files/table-file';
import { SNAP_RADIUS_DEFAULT } from '$lib/utils/constants-snap';
import type { GamePackDef } from '$lib/packs/types';
import {
	applyScenario,
	ensureSeatPlaceholder,
	getScenario,
	saveScenario,
	seatPlaceholderId
} from '../scenario';
import { parseScenarioFile, serializeScenarioFile } from '../file';

const emptyTable = () =>
	gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {}, snapPoints: {} });

/** a pack that ships with nothing and lives nowhere — the case that was broken */
const MY_PACK: GamePackDef = {
	id: 'ember-duel',
	name: 'Ember Duel',
	scope: 'player',
	decks: [
		{
			slot: 'main',
			name: 'Draw Pile',
			back: 'https://example.com/back.png',
			cards: [
				{ code: 'strike', name: 'Strike', face: 'https://example.com/strike.png' },
				{ code: 'guard', name: 'Guard', face: 'https://example.com/guard.png' },
				{ code: 'burn', name: 'Burn', face: 'https://example.com/burn.png' }
			]
		}
	],
	pieces: [{ kind: 'counter', name: 'HP', maxValue: 20, position: [0, 3] }]
};

const deckCardIds = (deckId: string) =>
	(get(gameStore).decks?.[deckId]?.cards ?? []).map((card) => card.id);

/** what "Open a pack (.tbpp.json) for seat N" does at /setup */
async function openPackForSeat(seat: 0 | 1 = 0, pack = MY_PACK) {
	await openTableFile(serializePackFile(pack), {
		ownerId: seatPlaceholderId(seat),
		beforeSpawn: () => ensureSeatPlaceholder(seat)
	});
}

describe('a pack opened from disk round-trips through a scenario', () => {
	beforeEach(() => {
		localStorage.clear();
		emptyTable();
		vi.restoreAllMocks();
	});

	it('files the opened pack in the local library and spawns it', async () => {
		await openPackForSeat(0);

		expect(listLibraryPacks().map((entry) => entry.pack.id)).toEqual(['ember-duel']);
		expect(deckCardIds('deck:seat0:main')).toHaveLength(3);
		expect(get(gameStore).decks?.['deck:seat0:main']?.packOrigin).toEqual({
			pack: 'ember-duel',
			content: 'main',
			source: 'local'
		});
	});

	it('comes back intact — same decks, same positions, same card order', async () => {
		await openPackForSeat(0);
		// arrange it, the way the /setup deck controls would
		gameStore.updateState({
			decks: { 'deck:seat0:main': { position: [3, 0.4, -2], isFaceUp: true } }
		});
		const arranged = deckCardIds('deck:seat0:main');
		const scenario = saveScenario('ember');

		expect(scenario.packs).toEqual([{ id: 'ember-duel', source: 'local' }]);
		// the pack is referenced, never inlined
		expect(JSON.stringify(scenario)).not.toContain('strike.png');

		emptyTable();
		const report = await applyScenario(getScenario('ember')!);

		expect(report).toMatchObject({ version: 2, failedPacks: [] });
		const deck = get(gameStore).decks?.['deck:seat0:main'];
		expect(deck?.position).toEqual([3, 0.4, -2]);
		expect(deck?.isFaceUp).toBe(true);
		expect(deckCardIds('deck:seat0:main')).toEqual(arranged);
		expect(get(gameStore).pieces?.['piece:seat0:hp-0']).toMatchObject({ maxValue: 20 });
	});

	it('still resolves after a page reload — both halves are localStorage', async () => {
		await openPackForSeat(0);
		const text = serializeScenarioFile(saveScenario('ember'));

		// a reload keeps localStorage and nothing else: no store, no module state
		emptyTable();
		expect(getLibraryPack('ember-duel')?.pack.name).toBe('Ember Duel');

		const report = await applyScenario(JSON.parse(JSON.stringify(getScenario('ember')!)));
		expect(report.failedPacks).toEqual([]);
		expect(deckCardIds('deck:seat0:main')).toHaveLength(3);
		// the exported file says the same thing the stored scenario does
		expect(JSON.parse(text).packs).toEqual([{ id: 'ember-duel', source: 'local' }]);
	});

	it('spawns the same library pack for two seats as independent, owned sets', () => {
		saveLibraryPack(MY_PACK);
		for (const seat of [0, 1] as const) {
			ensureSeatPlaceholder(seat);
			spawnPack(MY_PACK, { ownerId: seatPlaceholderId(seat) });
		}

		// sorted: a facedown deck spawns shuffled, so only the SET is fixed here
		expect(deckCardIds('deck:seat0:main').sort()).toEqual([
			'card:seat0:main-burn',
			'card:seat0:main-guard',
			'card:seat0:main-strike'
		]);
		expect(deckCardIds('deck:seat1:main').sort()).toEqual([
			'card:seat1:main-burn',
			'card:seat1:main-guard',
			'card:seat1:main-strike'
		]);
		// seat 1's copy is mirrored to the far side, not stacked on seat 0's
		const near = get(gameStore).decks?.['deck:seat0:main']?.position;
		const far = get(gameStore).decks?.['deck:seat1:main']?.position;
		expect(near?.[2]).toBeGreaterThan(0);
		expect(far?.[2]).toBeLessThan(0);
		expect(Object.keys(get(gameStore).pieces ?? {}).sort()).toEqual([
			'piece:seat0:hp-0',
			'piece:seat1:hp-0'
		]);
	});

	it('mixes a builtin and a local pack in one scenario', async () => {
		await openPackForSeat(0);
		ensureSeatPlaceholder(1);
		spawnPack(STANDARD_52, { ownerId: 'seat1' });

		const refs = saveScenario('mixed').packs ?? [];
		expect([...refs].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
			{ id: 'ember-duel', source: 'local' },
			{ id: 'standard-52', source: 'builtin' }
		]);

		emptyTable();
		const report = await applyScenario(getScenario('mixed')!);
		expect(report.failedPacks).toEqual([]);
		expect(deckCardIds('deck:seat1:main')).toHaveLength(52);
	});
});

describe('a pack this browser does not have fails loudly', () => {
	beforeEach(() => {
		localStorage.clear();
		emptyTable();
	});

	it('names the missing pack id instead of silently skipping it', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		await openPackForSeat(0);
		saveScenario('ember');

		// someone else's machine: the scenario travelled, the pack did not
		localStorage.removeItem('packs:v1');
		emptyTable();
		const report = await applyScenario({
			name: 'ember',
			createdAt: 0,
			state: {},
			packs: [{ id: 'ember-duel', source: 'local' }],
			placements: [{ kind: 'deck', pack: 'ember-duel', content: 'main', seat: 0 }]
		});

		expect(report.placed).toBe(0);
		expect(report.failedPacks).toHaveLength(1);
		expect(report.failedPacks[0].id).toBe('ember-duel');
		expect(report.failedPacks[0].reason).toMatch(/not in this browser's pack library/);
		expect(get(gameStore).decks).toEqual({});
		errors.mockRestore();
	});

	it('leaves a builtin ref alone when a local pack shares its id', async () => {
		// a library entry must never shadow a ref that says 'builtin'
		saveLibraryPack({ ...MY_PACK, id: STANDARD_52.id, name: 'Not Standard 52' });
		emptyTable();
		await applyScenario({
			name: 'builtin',
			createdAt: 0,
			state: {},
			packs: [{ id: STANDARD_52.id, source: 'builtin' }],
			placements: [{ kind: 'deck', pack: STANDARD_52.id, content: 'main', seat: 0 }]
		});

		expect(deckCardIds('deck:seat0:main')).toHaveLength(52);
	});
});

/**
 * The two halves of a scenario that were built in parallel (#93 local packs,
 * tableplace-96 snap points) and never tested together. They travel in
 * different fields — `packs`/`placements` vs the table-scoped `snapPoints`
 * array — so a table using both has to come back whole, and neither feature's
 * save path may quietly drop the other's.
 */
describe('a scenario carrying both local packs and snap points', () => {
	beforeEach(() => {
		localStorage.clear();
		emptyTable();
	});

	it('round-trips both halves together', async () => {
		await openPackForSeat(0);
		gameActions.addSnapPoint({ position: [2, -1], radius: 1.5, rotation: 90 });
		gameActions.addSnapPoint({ position: [-3, 4] });
		gameStore.updateState({ decks: { 'deck:seat0:main': { position: [3, 0.4, -2] } } });
		const arranged = deckCardIds('deck:seat0:main');

		const scenario = saveScenario('both');
		expect(scenario.packs).toEqual([{ id: 'ember-duel', source: 'local' }]);
		expect(scenario.snapPoints).toEqual([
			{ position: [2, -1], radius: 1.5, rotation: 90 },
			{ position: [-3, 4], radius: SNAP_RADIUS_DEFAULT }
		]);

		emptyTable();
		const report = await applyScenario(getScenario('both')!);

		expect(report.failedPacks).toEqual([]);
		expect(deckCardIds('deck:seat0:main')).toEqual(arranged);
		expect(get(gameStore).decks?.['deck:seat0:main']?.position).toEqual([3, 0.4, -2]);
		expect(Object.values(get(gameStore).snapPoints ?? {})).toEqual([
			{ id: 'snap:0', position: [2, -1], radius: 1.5, rotation: 90 },
			{ id: 'snap:1', position: [-3, 4], radius: SNAP_RADIUS_DEFAULT }
		]);
	});

	it('survives the file, not just localStorage', async () => {
		await openPackForSeat(0);
		gameActions.addSnapPoint({ position: [2, -1], rotation: 180 });
		const text = serializeScenarioFile(saveScenario('both'));

		const parsed = parseScenarioFile(text);
		expect(parsed.packs).toEqual([{ id: 'ember-duel', source: 'local' }]);
		expect(parsed.snapPoints).toEqual([
			{ position: [2, -1], radius: SNAP_RADIUS_DEFAULT, rotation: 180 }
		]);

		// and the same file dropped on the table lands both halves at once
		emptyTable();
		localStorage.removeItem('scenarios:v1');
		const opened = await openTableFile(text);

		expect(opened.kind).toBe('scenario');
		expect(opened.kind === 'scenario' && opened.report?.failedPacks).toEqual([]);
		expect(deckCardIds('deck:seat0:main')).toHaveLength(3);
		expect(get(gameStore).snapPoints?.['snap:0']).toMatchObject({
			position: [2, -1],
			rotation: 180
		});
	});
});
