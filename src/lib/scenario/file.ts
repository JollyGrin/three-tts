/**
 * tbps — the table.place scenario file format. See docs/packs.md.
 *
 * A scenario file is a saved table arrangement (`Scenario`) plus an in-band
 * discriminator `"tbps": 1`. Files are named `<name>.tbps.json`. Legacy
 * `scenario-<name>.json` exports (no `tbps` field) still parse as v0.
 */

import type { GameDTO } from '../store/game/types';

export const TBPS_VERSION = 1;
export const SCENARIO_SCHEMA_URL = 'https://table.place/scenario.schema.json';

export type Scenario = {
	name: string;
	createdAt: number;
	state: Partial<GameDTO>;
};

/** The on-disk shape of a `.tbps.json` file. */
export type ScenarioFile = Scenario & {
	/** format discriminator + version */
	tbps: 1;
	/** optional editor-validation hint; always written on export */
	$schema?: string;
};

export function scenarioFileName(name: string): string {
	return `${name}.tbps.json`;
}

/** Serialize a scenario for download as `<name>.tbps.json`. */
export function serializeScenarioFile(scenario: Scenario): string {
	const file: ScenarioFile = { $schema: SCENARIO_SCHEMA_URL, tbps: TBPS_VERSION, ...scenario };
	return JSON.stringify(file, null, '\t');
}

/**
 * Parse + validate a scenario file. Accepts current `.tbps.json` files and,
 * as a v0 fallback, the legacy `scenario-<name>.json` shape (no `tbps`
 * field) so existing exports keep importing. Throws a human-readable Error.
 */
export function parseScenarioFile(text: string): Scenario {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error('Not valid JSON');
	}
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		throw new Error('Not a scenario file: expected a JSON object');
	}
	const obj = raw as Record<string, unknown>;
	if (obj.tbps !== undefined && obj.tbps !== TBPS_VERSION) {
		throw new Error(
			`Unsupported scenario version ${JSON.stringify(obj.tbps)} — this app reads tbps ${TBPS_VERSION}`
		);
	}
	if (typeof obj.name !== 'string' || obj.name === '') {
		throw new Error('Not a scenario file: `name` must be a non-empty string');
	}
	if (typeof obj.state !== 'object' || obj.state === null || Array.isArray(obj.state)) {
		throw new Error('Not a scenario file: `state` must be an object');
	}
	return {
		name: obj.name,
		createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : Date.now(),
		state: obj.state as Partial<GameDTO>
	};
}
