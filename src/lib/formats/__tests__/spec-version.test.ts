/**
 * Spec versioning: every emitted document declares the spec it was written
 * against, and the importer decides readability from the DOCUMENT's declared
 * version rather than from its own.
 *
 * The property that matters: a file that has already escaped into the wild
 * stays readable by a future build, and a file from a future build is refused
 * with a message you can act on instead of failing somewhere in the renderer.
 */
import { describe, expect, it } from 'vitest';

import { PACK_SPEC_VERSION, SCENARIO_SPEC_VERSION, parseSemver } from '../spec-version';
import { parsePackFile, serializePackFile } from '$lib/packs/file';
import { parseScenarioFile, serializeScenarioFile } from '$lib/scenario/file';
import { STANDARD_52 } from '$lib/packs/standard52';

const packFile = (overrides: Record<string, unknown> = {}) =>
	JSON.stringify({ ...JSON.parse(serializePackFile(STANDARD_52)), ...overrides });

const scenarioFile = (overrides: Record<string, unknown> = {}) =>
	JSON.stringify({ tbps: 1, name: 's', createdAt: 1, state: {}, ...overrides });

// derived from the live version, so a spec bump doesn't turn "one minor ahead"
// into a version this build already reads and quietly stop testing the rule
const scenario = parseSemver(SCENARIO_SPEC_VERSION)!;
const NEWER_SCENARIO_PATCH = `0.${scenario.minor}.${scenario.patch + 9}`;
const NEWER_SCENARIO_MINOR = `0.${scenario.minor + 1}.0`;
const OLDER_SCENARIO_PATCH = `0.${scenario.minor}.0`;

describe('emitted documents declare their spec version', () => {
	it('stamps a pack export', () => {
		expect(JSON.parse(serializePackFile(STANDARD_52)).specVersion).toBe(PACK_SPEC_VERSION);
	});

	it('stamps a scenario export, v1 and v2 alike', () => {
		const v1 = { name: 's', createdAt: 1, state: {} };
		const v2 = { ...v1, packs: [{ id: 'standard-52' }], placements: [] };
		expect(JSON.parse(serializeScenarioFile(v1)).specVersion).toBe(SCENARIO_SPEC_VERSION);
		expect(JSON.parse(serializeScenarioFile(v2)).specVersion).toBe(SCENARIO_SPEC_VERSION);
	});

	it('declares versions that are well-formed semver', () => {
		expect(parseSemver(PACK_SPEC_VERSION)).not.toBeNull();
		expect(parseSemver(SCENARIO_SPEC_VERSION)).not.toBeNull();
		// the scenario spec is deliberately 0.x — unstable, per #39
		expect(parseSemver(SCENARIO_SPEC_VERSION)?.major).toBe(0);
	});

	it('round-trips its own output', () => {
		expect(() => parsePackFile(serializePackFile(STANDARD_52))).not.toThrow();
		expect(() =>
			parseScenarioFile(serializeScenarioFile({ name: 's', createdAt: 1, state: {} }))
		).not.toThrow();
	});
});

describe('a pack importer reads what the document declares', () => {
	it('accepts a file written before spec versioning existed', () => {
		const legacy = JSON.parse(serializePackFile(STANDARD_52));
		delete legacy.specVersion;
		expect(() => parsePackFile(JSON.stringify(legacy))).not.toThrow();
	});

	it('accepts an older spec version', () => {
		expect(() => parsePackFile(packFile({ specVersion: '0.9.0' }))).not.toThrow();
	});

	it('accepts a newer minor — additive by the release convention', () => {
		expect(() => parsePackFile(packFile({ specVersion: '1.7.3' }))).not.toThrow();
	});

	it('refuses a newer major and names the tag to fetch', () => {
		expect(() => parsePackFile(packFile({ specVersion: '2.0.0' }))).toThrow(
			/declares pack spec 2\.0\.0.*spec\/pack\/v2\.0\.0/s
		);
	});

	it('refuses a malformed spec version', () => {
		expect(() => parsePackFile(packFile({ specVersion: 'v1' }))).toThrow(/not a semver version/);
		expect(() => parsePackFile(packFile({ specVersion: 3 }))).toThrow(/must be a semver string/);
	});
});

describe('a scenario importer applies the 0.x rule', () => {
	it('accepts a file written before spec versioning existed', () => {
		expect(() => parseScenarioFile(scenarioFile())).not.toThrow();
	});

	it('accepts a newer patch', () => {
		expect(() =>
			parseScenarioFile(scenarioFile({ specVersion: NEWER_SCENARIO_PATCH }))
		).not.toThrow();
	});

	it('accepts an older patch — a file from before the last additive bump', () => {
		// additive changes bump the patch while the spec is 0.x (see
		// spec-version.ts), so this is what "the previous release" looks like
		expect(() =>
			parseScenarioFile(scenarioFile({ specVersion: OLDER_SCENARIO_PATCH }))
		).not.toThrow();
	});

	it('refuses a newer minor, because 0.x minors are allowed to break', () => {
		expect(() => parseScenarioFile(scenarioFile({ specVersion: NEWER_SCENARIO_MINOR }))).toThrow(
			new RegExp(`declares scenario spec ${NEWER_SCENARIO_MINOR.replace(/\./g, '\\.')}`)
		);
	});

	it('refuses a 1.x file once the spec is still 0.x here', () => {
		expect(() => parseScenarioFile(scenarioFile({ specVersion: '1.0.0' }))).toThrow(
			/spec\/scenario\/v1\.0\.0/
		);
	});
});
