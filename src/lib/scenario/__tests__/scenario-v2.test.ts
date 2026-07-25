/**
 * tbps v2: a scenario references packs and describes the arrangement, instead
 * of snapshotting the pack's cards into every file. What has to hold:
 * pack content is never inlined, the authored card order round-trips exactly,
 * shuffling only happens when the placement asks for it, and v1/legacy files
 * keep loading the way they always did.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import type { GameDTO } from '$lib/store/game/types';
import { STANDARD_52 } from '$lib/packs/standard52';
import { spawnPackDeck, spawnPack } from '$lib/packs/spawn';
import {
	applyScenario,
	claimSeat,
	ensureSeatPlaceholder,
	getScenario,
	importScenarioFromText,
	saveScenario,
	seatPlaceholderId
} from '../scenario';
import { parseScenarioFile, serializeScenarioFile, scenarioVersion, type Scenario } from '../file';
import { SCENARIO_SPEC_VERSION } from '$lib/formats/spec-version';

const emptyTable = () =>
	gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });

/** a deliberately non-sorted stack — a rigged opening hand, an encounter deck */
const STACKED = ['7H', 'AS', '2C', 'KD', '10S'];

function authorStackedDeck(seat: 0 | 1 = 0, order = STACKED) {
	emptyTable();
	ensureSeatPlaceholder(seat);
	spawnPackDeck(STANDARD_52, STANDARD_52.decks[0], {
		ownerId: seatPlaceholderId(seat),
		order,
		position: [3, 0.4, -2]
	});
}

const deckCardIds = (deckId: string) =>
	(get(gameStore).decks?.[deckId]?.cards ?? []).map((card) => card.id);

describe('tbps v2 — pack refs instead of inlined content', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('exports a pack ref + placement instead of the cards', () => {
		authorStackedDeck();
		const scenario = saveScenario('stacked');

		expect(scenarioVersion(scenario)).toBe(2);
		expect(scenario.packs).toEqual([{ id: 'standard-52', source: 'builtin' }]);
		expect(scenario.placements).toHaveLength(1);
		expect(scenario.placements?.[0]).toMatchObject({
			kind: 'deck',
			pack: 'standard-52',
			content: 'main',
			seat: 0,
			position: [3, 0.4, -2],
			order: STACKED
		});
		// the whole point: no card bodies, and the deck isn't in the raw snapshot
		expect(scenario.state.decks).toEqual({});
		expect(JSON.stringify(scenario)).not.toContain('gen:std52/AS');
	});

	it('reproduces the saved arrangement on load', async () => {
		authorStackedDeck();
		const before = get(gameStore).decks?.['deck:seat0:main'];
		saveScenario('stacked');

		emptyTable();
		const report = await applyScenario(getScenario('stacked')!);

		expect(report).toMatchObject({ version: 2, placed: 1, failedPacks: [] });
		const after = get(gameStore).decks?.['deck:seat0:main'];
		expect(after?.position).toEqual([3, 0.4, -2]);
		expect(after?.cards).toEqual(before?.cards);
		expect(after?.packOrigin).toEqual({ pack: 'standard-52', content: 'main', source: 'builtin' });
		// the seat placeholder the placement needs is re-created
		expect(get(gameStore).players?.seat0?.seat).toBe(0);
	});

	it('preserves the authored card order exactly', async () => {
		authorStackedDeck();
		saveScenario('stacked');
		emptyTable();
		await applyScenario(getScenario('stacked')!);

		expect(deckCardIds('deck:seat0:main')).toEqual(
			STACKED.map((code) => `card:seat0:main-${code}`)
		);
	});

	it('round-trips a full 52-card deck through an exported file', async () => {
		emptyTable();
		ensureSeatPlaceholder(0);
		spawnPack(STANDARD_52, { ownerId: 'seat0' });
		const authored = deckCardIds('deck:seat0:main');
		expect(authored).toHaveLength(52);
		const text = serializeScenarioFile(saveScenario('full'));

		emptyTable();
		localStorage.clear();
		await applyScenario(importScenarioFromText(text));

		expect(deckCardIds('deck:seat0:main')).toEqual(authored);
	});

	it('writes tbps 2 and parses it back', () => {
		authorStackedDeck();
		const text = serializeScenarioFile(saveScenario('stacked'));
		expect(JSON.parse(text).tbps).toBe(2);

		const parsed = parseScenarioFile(text);
		expect(parsed.packs).toEqual([{ id: 'standard-52', source: 'builtin' }]);
		expect(parsed.placements?.[0].order).toEqual(STACKED);
	});

	it('rejects a scenario from a future version', () => {
		expect(() => parseScenarioFile(JSON.stringify({ tbps: 3, name: 'x', state: {} }))).toThrow(
			/Unsupported scenario version 3/
		);
	});

	it('reports an unresolvable pack instead of throwing', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		emptyTable();
		const report = await applyScenario({
			name: 'missing',
			createdAt: 0,
			state: {},
			packs: [{ id: 'nope' }],
			placements: [{ kind: 'deck', pack: 'nope', content: 'main', seat: 0 }]
		});

		expect(report.placed).toBe(0);
		expect(report.failedPacks).toEqual([
			{ id: 'nope', reason: "no builtin or local pack 'nope' and no source url" }
		]);
		expect(get(gameStore).decks).toEqual({});
		errors.mockRestore();
	});
});

describe('tbps v2 — shuffle is opt-in, per placement', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('does not shuffle a placement by default', async () => {
		authorStackedDeck();
		saveScenario('stacked');
		emptyTable();
		const shuffle = vi.spyOn(gameActions, 'shuffleCards');

		await applyScenario(getScenario('stacked')!);

		expect(shuffle).not.toHaveBeenCalled();
	});

	it('routes through the shuffle path when shuffleOnLoad is set', async () => {
		emptyTable();
		const shuffle = vi.spyOn(gameActions, 'shuffleCards');

		await applyScenario({
			name: 'shuffled',
			createdAt: 0,
			state: {},
			packs: [{ id: 'standard-52', source: 'builtin' }],
			placements: [
				{
					kind: 'deck',
					pack: 'standard-52',
					content: 'main',
					seat: 0,
					order: STACKED,
					shuffleOnLoad: true
				}
			]
		});

		expect(shuffle).toHaveBeenCalledTimes(1);
		// still the authored *set*, just reordered
		expect(deckCardIds('deck:seat0:main').sort()).toEqual(
			STACKED.map((code) => `card:seat0:main-${code}`).sort()
		);
	});

	it('carries shuffleOnLoad back out through an export', () => {
		emptyTable();
		ensureSeatPlaceholder(0);
		spawnPackDeck(STANDARD_52, STANDARD_52.decks[0], {
			ownerId: 'seat0',
			order: STACKED,
			shuffleOnLoad: true
		});

		expect(saveScenario('draw').placements?.[0].shuffleOnLoad).toBe(true);
	});

	it('holds a stacked deck and a shuffled deck side by side', async () => {
		const shuffle = vi.spyOn(gameActions, 'shuffleCards');
		emptyTable();
		await applyScenario({
			name: 'mixed',
			createdAt: 0,
			state: {},
			packs: [{ id: 'standard-52', source: 'builtin' }],
			placements: [
				{ kind: 'deck', pack: 'standard-52', content: 'main', seat: 0, order: STACKED },
				{
					kind: 'deck',
					pack: 'standard-52',
					content: 'main',
					seat: 1,
					order: STACKED,
					shuffleOnLoad: true
				}
			]
		});

		expect(deckCardIds('deck:seat0:main')).toEqual(STACKED.map((c) => `card:seat0:main-${c}`));
		expect(shuffle).toHaveBeenCalledTimes(1);
	});
});

describe('tbps v2 — hand-placed content still falls back to raw state', () => {
	beforeEach(() => localStorage.clear());

	it('keeps ad-hoc pieces in state while decks become placements', async () => {
		authorStackedDeck();
		const counter = gameActions.addPiece('counter', { ownerId: 'seat0', name: 'HP', maxValue: 20 });
		const scenario = saveScenario('mixed');

		expect(scenario.placements).toHaveLength(1);
		expect(Object.keys(scenario.state.pieces ?? {})).toEqual([counter]);

		emptyTable();
		await applyScenario(getScenario('mixed')!);
		expect(get(gameStore).pieces?.[counter]).toMatchObject({ name: 'HP', value: 20 });
		expect(deckCardIds('deck:seat0:main')).toHaveLength(STACKED.length);
	});

	it('exports a table with no pack content as v1', () => {
		emptyTable();
		ensureSeatPlaceholder(0);
		gameActions.addPiece('token', { ownerId: 'seat0', name: 'Objective' });
		const scenario = saveScenario('hand-made');

		expect(scenarioVersion(scenario)).toBe(1);
		expect(scenario.packs).toBeUndefined();
		expect(JSON.parse(serializeScenarioFile(scenario)).tbps).toBe(1);
	});
});

describe('seat claiming with pack-spawned entities', () => {
	beforeEach(() => localStorage.clear());

	it('renames pack-spawned ids onto the claiming player, provenance intact', async () => {
		authorStackedDeck();
		saveScenario('claimable');

		emptyTable();
		localStorage.setItem('myPlayerId', 'player9');
		gameActions.addPlayer('player9');
		await applyScenario(getScenario('claimable')!);
		expect(claimSeat(0)).toBe(true);

		const decks = get(gameStore).decks ?? {};
		expect(Object.keys(decks)).toEqual(['deck:player9:main']);
		const claimed = decks['deck:player9:main'];
		// claimSeat splits ids on ':' — pack-spawned ids keep the kind:owner:slug shape
		expect(claimed?.id).toBe('deck:player9:main');
		// provenance rides along (claimSeat spreads the deck value), so a
		// re-save of a claimed table still exports as v2
		expect(claimed?.packOrigin).toEqual({
			pack: 'standard-52',
			content: 'main',
			source: 'builtin'
		});
		expect(get(gameStore).players?.player9?.seat).toBe(0);
		// cards *inside* a deck keep the placeholder owner — claimSeat only
		// rewrites entity keys, and a drawn card lands under its in-deck id.
		// Pack-spawned decks match TTS-imported ones here; see issue #58.
		expect(claimed?.cards?.map((card) => card.id)).toEqual(
			STACKED.map((code) => `card:seat0:main-${code}`)
		);
	});

	it('renames pack-spawned pieces onto the claiming player', async () => {
		emptyTable();
		ensureSeatPlaceholder(0);
		const piecePack = {
			id: 'token-pack',
			name: 'Tokens',
			scope: 'player' as const,
			decks: [],
			pieces: [
				{ kind: 'counter' as const, name: 'HP', maxValue: 30, position: [0, 3] as [number, number] }
			]
		};
		// a remote pack, so the fetch+parse resolution path is exercised too
		const source = 'https://example.com/tokens.tbpp.json';
		const scenario: Scenario = {
			name: 'tokens',
			createdAt: 0,
			state: {},
			packs: [{ id: 'token-pack', source }],
			placements: [{ kind: 'piece', pack: 'token-pack', content: '0', seat: 0, value: 12 }]
		};
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ tbpp: 1, ...piecePack }))
		);

		localStorage.setItem('myPlayerId', 'player9');
		gameActions.addPlayer('player9');
		await applyScenario(scenario);
		expect(get(gameStore).pieces?.['piece:seat0:hp-0']).toMatchObject({ value: 12, maxValue: 30 });

		expect(claimSeat(0)).toBe(true);
		expect(Object.keys(get(gameStore).pieces ?? {})).toEqual(['piece:player9:hp-0']);
		expect(get(gameStore).pieces?.['piece:player9:hp-0']).toMatchObject({
			packOrigin: {
				pack: 'token-pack',
				content: '0',
				source: 'https://example.com/tokens.tbpp.json'
			}
		});
	});
});

describe('legacy scenarios keep loading unchanged', () => {
	beforeEach(() => localStorage.clear());

	const legacyState: Partial<GameDTO> = {
		cards: {},
		decks: {
			'deck:seat0:legacy': {
				id: 'deck:seat0:legacy',
				isFaceUp: false,
				position: [1, 0.4, 2],
				rotation: [0, 0, 0],
				cards: [{ id: 'card:seat0:legacy-1', faceImageUrl: 'https://example.com/a.png' }]
			}
		},
		pieces: { 'piece:seat0:hp-0': { kind: 'counter', name: 'HP', value: 12, maxValue: 20 } },
		overlays: {},
		players: { seat0: { id: 'seat0', seat: 0, joinTimestamp: 0, tray: {}, metadata: {} } }
	};

	it('loads a v0 file (no tbps field) into exactly its snapshot', async () => {
		emptyTable();
		const scenario = importScenarioFromText(
			JSON.stringify({ name: 'legacy', createdAt: 1, state: legacyState })
		);
		const report = await applyScenario(scenario);

		expect(report.version).toBe(1);
		const s = get(gameStore);
		expect(s.decks).toEqual(legacyState.decks);
		expect(s.pieces).toEqual(legacyState.pieces);
		expect(s.players).toEqual(legacyState.players);
	});

	it('loads a v1 file into exactly its snapshot', async () => {
		emptyTable();
		const scenario = importScenarioFromText(
			JSON.stringify({ tbps: 1, name: 'v1', createdAt: 1, state: legacyState })
		);
		await applyScenario(scenario);

		expect(get(gameStore).decks).toEqual(legacyState.decks);
	});

	it('applies a v1 snapshot synchronously, as it always did', () => {
		emptyTable();
		// no await: the legacy path must not defer its store writes to a microtask
		applyScenario({ name: 'sync', createdAt: 1, state: legacyState });

		expect(get(gameStore).decks).toEqual(legacyState.decks);
	});

	it('re-exports an unmodified legacy scenario as v1', () => {
		const scenario = importScenarioFromText(
			JSON.stringify({ name: 'legacy', createdAt: 1, state: legacyState })
		);
		expect(scenarioVersion(scenario)).toBe(1);
		expect(JSON.parse(serializeScenarioFile(scenario))).toEqual({
			$schema: 'https://table.place/scenario.schema.json',
			tbps: 1,
			// a legacy file re-exports as v1, but stamped with the spec it was
			// written by — that is what makes it identifiable later
			specVersion: SCENARIO_SPEC_VERSION,
			name: 'legacy',
			createdAt: 1,
			state: legacyState
		});
	});
});
