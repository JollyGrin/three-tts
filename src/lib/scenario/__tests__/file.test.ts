import { describe, it, expect } from 'vitest';
import {
	parseScenarioFile,
	serializeScenarioFile,
	scenarioFileName,
	SCENARIO_SCHEMA_URL,
	type Scenario
} from '../file';

const scenario: Scenario = {
	name: 'duel',
	createdAt: 1700000000000,
	state: {
		cards: { 'card:seat0:main-AS': { position: [0, 0.1, 0], faceImageUrl: 'gen:std52/AS' } },
		decks: {},
		pieces: { 'piece:seat0:hp-0': { kind: 'counter', name: 'HP', value: 20, maxValue: 20 } },
		overlays: {},
		players: { seat0: { id: 'seat0', seat: 0, joinTimestamp: 0, tray: {}, metadata: {} } }
	}
};

describe('tbps round-trip', () => {
	it('export → parse returns the same scenario', () => {
		expect(parseScenarioFile(serializeScenarioFile(scenario))).toEqual(scenario);
	});

	it('writes the discriminator and $schema line', () => {
		const file = JSON.parse(serializeScenarioFile(scenario));
		expect(file.tbps).toBe(1);
		expect(file.$schema).toBe(SCENARIO_SCHEMA_URL);
	});

	it('names files <name>.tbps.json', () => {
		expect(scenarioFileName('duel')).toBe('duel.tbps.json');
	});
});

describe('legacy scenario-<name>.json fallback (v0)', () => {
	it('accepts files without a tbps field', () => {
		const legacy = { name: 'old', createdAt: 123, state: { cards: {}, decks: {}, players: {} } };
		expect(parseScenarioFile(JSON.stringify(legacy))).toEqual(legacy);
	});

	it('defaults a missing createdAt', () => {
		const legacy = { name: 'old', state: {} };
		const parsed = parseScenarioFile(JSON.stringify(legacy));
		expect(parsed.createdAt).toBeTypeOf('number');
	});
});

describe('parseScenarioFile errors', () => {
	it('rejects non-JSON', () => {
		expect(() => parseScenarioFile('nope')).toThrow(/valid JSON/);
	});

	it('rejects unknown versions', () => {
		expect(() => parseScenarioFile(JSON.stringify({ tbps: 9, name: 'x', state: {} }))).toThrow(
			/version 9/
		);
	});

	it('rejects files without a name or state', () => {
		expect(() => parseScenarioFile(JSON.stringify({ state: {} }))).toThrow(/name/);
		expect(() => parseScenarioFile(JSON.stringify({ name: 'x' }))).toThrow(/state/);
	});
});
