/**
 * The published authoring contract (tableplace-78).
 *
 * `static/{pack,scenario}.schema.json` and `static/llms.txt` are what a third
 * party reads to author an importable file, so what has to hold is: the doc
 * really is self-contained and agrees with the schemas beside it, and the
 * worked examples it publishes actually survive the app's own import path.
 *
 * Schema-vs-types drift is caught by regenerating in CI (`bun run schemas`
 * then `git diff --exit-code`); this file guards everything downstream of it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { get } from 'svelte/store';
import Ajv from 'ajv';

import { EXAMPLE_PACK, EXAMPLE_PACK_URL, EXAMPLE_SCENARIO } from '../examples';
import { parsePackFile, serializePackFile } from '$lib/packs/file';
import { spawnPack } from '$lib/packs/spawn';
import { RANKS, STANDARD_52, SUITS } from '$lib/packs/standard52';
import { makeSheetRef } from '$lib/packs/resolve.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { serializeScenarioFile } from '$lib/scenario/file';
import {
	applyScenario,
	ensureSeatPlaceholder,
	importScenarioFromText,
	saveScenario
} from '$lib/scenario/scenario';
import { CARD_REST_Y } from '$lib/utils/constants-cards';
import { TABLE_HALF_X } from '$lib/utils/constants-table';

const staticDir = join(__dirname, '../../../../static');
const read = (name: string) => readFileSync(join(staticDir, name), 'utf-8');

const packSchemaText = read('pack.schema.json');
const scenarioSchemaText = read('scenario.schema.json');
const llms = read('llms.txt');

const ajv = new Ajv({ allowUnionTypes: true });
const validatePack = ajv.compile(JSON.parse(packSchemaText));
const validateScenario = ajv.compile(JSON.parse(scenarioSchemaText));

const emptyTable = () =>
	gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });

describe('llms.txt is self-contained', () => {
	it('inlines both JSON schemas verbatim', () => {
		// the doc must stand alone in a session with no network access
		expect(llms).toContain(packSchemaText.trimEnd());
		expect(llms).toContain(scenarioSchemaText.trimEnd());
	});

	it('inlines both worked examples verbatim', () => {
		expect(llms).toContain(JSON.stringify(EXAMPLE_PACK, null, '\t'));
		expect(llms).toContain(JSON.stringify(EXAMPLE_SCENARIO, null, '\t'));
	});

	it('documents all three face-ref schemes, which no schema can express', () => {
		expect(llms).toContain('gen:std52/');
		expect(llms).toContain('sheet:');
		// the sheet payload field list, matching resolve.svelte.ts's SheetRefPayload
		for (const field of ['`url`', '`cols`', '`rows`', '`index`', '`name`', '`back`']) {
			expect(llms).toContain(field);
		}
	});

	it('states the gen:std52 rank/suit grammar the generator actually implements', () => {
		// the doc names every suit; standard52.ts is where they really live
		for (const suit of SUITS) expect(llms).toContain(`\`${suit}\``);
		// and every builtin face decomposes exactly as the doc says it does:
		// suit is the final character, rank is everything before it
		for (const card of STANDARD_52.decks[0].cards) {
			expect(card.face.startsWith('gen:std52/')).toBe(true);
			const code = card.face.slice('gen:std52/'.length);
			expect(SUITS).toContain(code.slice(-1));
			expect(RANKS).toContain(code.slice(0, -1));
		}
	});

	it('shows a sheet: ref byte-identical to what makeSheetRef produces', () => {
		// the doc's sample is the contract for a payload nested in a JSON string
		const sample = makeSheetRef({
			url: 'https://example.com/sheet.png',
			cols: 10,
			rows: 7,
			index: 13,
			name: 'Strike',
			back: false
		});
		expect(llms).toContain(sample);
	});

	it('publishes the world-coordinate constants an outside generator needs', () => {
		// values injected from constants-*.ts, so the doc cannot drift from them
		expect(llms).toContain(`| \`TABLE_HALF_X\` | ${TABLE_HALF_X} |`);
		expect(llms).toContain(`| \`CARD_REST_Y\` | ${CARD_REST_Y} |`);
	});

	it('scopes the scenario format as unstable and the pack format as a contract', () => {
		expect(llms).toContain('**The scenario format (tbps) is UNSTABLE.**');
		expect(llms).toContain('no compatibility guarantee');
		expect(llms).toContain('**The pack format (tbpp) is a stated contract.**');
	});

	it('lists the open questions instead of inventing policy for them', () => {
		expect(llms).toContain('## 8. Known gaps');
		expect(llms).toContain('Card multiplicity');
		expect(llms).toContain('Pack content versioning');
		expect(llms).toContain('collision policy');
	});

	it('leaves no unfilled template placeholder', () => {
		expect(llms).not.toMatch(/\{\{\w+\}\}/);
	});
});

describe('the published examples validate against the published schemas', () => {
	it('accepts the worked pack example', () => {
		const ok = validatePack(JSON.parse(JSON.stringify(EXAMPLE_PACK)));
		expect(validatePack.errors ?? []).toEqual([]);
		expect(ok).toBe(true);
	});

	it('accepts the worked scenario example', () => {
		const ok = validateScenario(JSON.parse(JSON.stringify(EXAMPLE_SCENARIO)));
		expect(validateScenario.errors ?? []).toEqual([]);
		expect(ok).toBe(true);
	});
});

describe('round-trip: the worked pack example lands on a table', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
		emptyTable();
	});

	it('parses, validates and spawns into the expected table state', () => {
		const parsed = parsePackFile(serializePackFile(EXAMPLE_PACK));
		ensureSeatPlaceholder(0);
		// keep the facedown deck deterministic so the assertion is on content
		vi.spyOn(gameActions, 'shuffleCards').mockImplementation((cards) => cards);

		spawnPack(parsed, { ownerId: 'seat0' });
		const table = get(gameStore);

		expect(Object.keys(table.decks ?? {}).sort()).toEqual(['deck:seat0:main', 'deck:seat0:wounds']);
		expect((table.decks?.['deck:seat0:main']?.cards ?? []).map((c) => c.id)).toEqual([
			'card:seat0:main-strike',
			'card:seat0:main-guard',
			'card:seat0:main-ember'
		]);
		// face refs travel as refs — never resolved image data
		expect(table.decks?.['deck:seat0:main']?.cards?.[0]?.faceImageUrl).toBe(
			'https://example.com/img/strike.png'
		);
		expect(table.decks?.['deck:seat0:wounds']?.isFaceUp).toBe(true);

		const piece = Object.values(table.pieces ?? {})[0];
		expect(piece).toMatchObject({ kind: 'counter', name: 'Health', maxValue: 25 });

		const overlay = table.overlays?.['overlay:ember-duel:0'];
		expect(overlay).toMatchObject({ imageUrl: 'https://example.com/img/arena.webp', ratio: 1.6 });
	});

	it('reports the offending field when the example is corrupted', () => {
		const broken = JSON.parse(serializePackFile(EXAMPLE_PACK));
		delete broken.decks[0].cards[1].face;
		expect(() => parsePackFile(JSON.stringify(broken))).toThrow(
			/decks\[0\]\.cards\[1\]\.face must be a non-empty string/
		);
	});
});

describe('round-trip: the worked scenario example imports, applies and re-exports', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
		emptyTable();
		// the example references one builtin pack and one fetched by URL; serve
		// the published pack example from that URL so the remote path is exercised
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url !== EXAMPLE_PACK_URL) throw new Error(`unexpected fetch: ${url}`);
				return { ok: true, status: 200, text: async () => serializePackFile(EXAMPLE_PACK) };
			})
		);
		// shuffling and the export's `createdAt` stamp are the only
		// nondeterminism; pin both so the export is comparable byte for byte
		vi.spyOn(gameActions, 'shuffleCards').mockImplementation((cards) => cards);
		vi.spyOn(Date, 'now').mockReturnValue(EXAMPLE_SCENARIO.createdAt);
	});

	async function importApplyExport(text: string): Promise<string> {
		emptyTable();
		const report = await applyScenario(importScenarioFromText(text));
		expect(report.failedPacks).toEqual([]);
		return serializeScenarioFile(saveScenario(EXAMPLE_SCENARIO.name));
	}

	it('places every kind of content the example declares', async () => {
		await applyScenario(importScenarioFromText(JSON.stringify(EXAMPLE_SCENARIO)));
		const table = get(gameStore);

		// the stacked deck keeps its authored order exactly
		expect((table.decks?.['deck:seat0:main']?.cards ?? []).map((c) => c.id)).toEqual([
			'card:seat0:main-ember',
			'card:seat0:main-strike',
			'card:seat0:main-guard'
		]);
		// the seat-1 deck came from the builtin pack
		expect(table.decks?.['deck:seat1:main']?.cards).toHaveLength(52);
		expect(table.overlays?.['overlay:ember-duel:0']?.scale).toBe(14);
		// the hand-placed token in `state` survives alongside pack content
		expect(table.pieces?.['piece:seat0:objective-0']).toMatchObject({ name: 'Objective' });
	});

	it('re-exports a file that deep-equals the next round-trip of itself', async () => {
		const first = await importApplyExport(JSON.stringify(EXAMPLE_SCENARIO));
		const second = await importApplyExport(first);

		expect(JSON.parse(second)).toEqual(JSON.parse(first));
		// and it is still a valid, re-importable scenario
		expect(validateScenario(JSON.parse(second))).toBe(true);
	});

	it('re-exports the packs and placements the example declared', async () => {
		const exported = JSON.parse(await importApplyExport(JSON.stringify(EXAMPLE_SCENARIO)));

		expect(exported.tbps).toBe(2);
		expect(exported.packs).toEqual(
			expect.arrayContaining([
				{ id: 'standard-52', source: 'builtin' },
				{ id: 'ember-duel', source: EXAMPLE_PACK_URL }
			])
		);
		for (const placement of EXAMPLE_SCENARIO.placements ?? []) {
			expect(exported.placements).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: placement.kind,
						pack: placement.pack,
						content: placement.content
					})
				])
			);
		}
	});
});
