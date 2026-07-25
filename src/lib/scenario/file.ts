/**
 * tbps — the table.place scenario file format. See docs/packs.md.
 *
 * A scenario file is a saved table arrangement (`Scenario`) plus an in-band
 * discriminator. Files are named `<name>.tbps.json`.
 *
 * - **v2** references packs (`packs` + `placements`) instead of inlining their
 *   content: a scenario says *which* content and *where it goes*, the pack says
 *   *what it is*. `state` stays for anything not pack-derived.
 * - **v1** is a self-contained `Partial<GameDTO>` snapshot.
 * - **v0** is the legacy `scenario-<name>.json` export (no `tbps` field).
 *
 * All three load; only v2 is written for pack-derived tables.
 */

import type { GameDTO } from '../store/game/types';

export const TBPS_VERSION = 2;
/** versions this app can read */
export const TBPS_SUPPORTED = [1, 2] as const;
export const SCENARIO_SCHEMA_URL = 'https://table.place/scenario.schema.json';

export type SeatIndex = 0 | 1 | 2 | 3;

/** Enough to re-resolve a pack's content at load time. */
export type PackRef = {
	/** pack id, e.g. 'standard-52' */
	id: string;
	/** `'builtin'` or a URL a `.tbpp.json` can be fetched from; defaults to builtin lookup */
	source?: string;
};

/**
 * Where one piece of pack content goes. `content` is the deck `slot` (decks)
 * or the array index (pieces/overlays) within the referenced pack — the
 * `<pack>/<slot>` half of the `<pack>/<slot>/<code>` addressing in docs/packs.md.
 */
export type PackPlacement = {
	kind: 'deck' | 'piece' | 'overlay';
	/** `PackRef.id` this content comes from */
	pack: string;
	content: string;
	/** placeholder seat that owns the spawned entity; omitted for table-scoped overlays */
	seat?: SeatIndex;
	position?: [number, number, number];
	rotation?: [number, number, number];
	/** decks only */
	isFaceUp?: boolean;
	/**
	 * decks only — the authored card order as pack card `code`s. A scenario is a
	 * saved arrangement, so a stacked deck round-trips exactly. Ids only, never
	 * card bodies: referencing the pack is the whole point of v2.
	 */
	order?: string[];
	/**
	 * decks only — reshuffle on load instead of restoring `order`. Per placement,
	 * so one scenario can hold a fixed encounter deck and a shuffled draw deck.
	 */
	shuffleOnLoad?: boolean;
	/** counter pieces only */
	value?: number;
	/** overlays only */
	scale?: number;
};

export type Scenario = {
	name: string;
	createdAt: number;
	/** overrides + anything not pack-derived (ad-hoc pieces, hand-placed cards) */
	state: Partial<GameDTO>;
	/** v2: packs this scenario draws content from */
	packs?: PackRef[];
	/** v2: where that content goes */
	placements?: PackPlacement[];
};

/** The on-disk shape of a `.tbps.json` file. */
export type ScenarioFile = Scenario & {
	/** format discriminator + version */
	tbps: 1 | 2;
	/** optional editor-validation hint; always written on export */
	$schema?: string;
};

/** v2 iff it references packs — a hand-placed table still exports as v1. */
export function scenarioVersion(scenario: Scenario): 1 | 2 {
	return scenario.packs?.length || scenario.placements?.length ? 2 : 1;
}

export function scenarioFileName(name: string): string {
	return `${name}.tbps.json`;
}

/** Serialize a scenario for download as `<name>.tbps.json`. */
export function serializeScenarioFile(scenario: Scenario): string {
	const { packs, placements, ...rest } = scenario;
	const version = scenarioVersion(scenario);
	const file: ScenarioFile =
		version === 2
			? {
					$schema: SCENARIO_SCHEMA_URL,
					tbps: 2,
					...rest,
					packs: packs ?? [],
					placements: placements ?? []
				}
			: { $schema: SCENARIO_SCHEMA_URL, tbps: 1, ...rest };
	return JSON.stringify(file, null, '\t');
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(message: string): never {
	throw new Error(message);
}

function vec3(v: unknown, path: string): [number, number, number] {
	if (!Array.isArray(v) || v.length !== 3 || v.some((n) => typeof n !== 'number')) {
		fail(`${path} must be [x, y, z]`);
	}
	return v as [number, number, number];
}

function parsePackRef(v: unknown, path: string): PackRef {
	if (!isRecord(v)) fail(`${path} must be an object`);
	if (typeof v.id !== 'string' || v.id === '') fail(`${path}.id must be a non-empty string`);
	const ref: PackRef = { id: v.id };
	if (v.source !== undefined) {
		if (typeof v.source !== 'string' || v.source === '') {
			fail(`${path}.source must be 'builtin' or a URL`);
		}
		ref.source = v.source;
	}
	return ref;
}

const PLACEMENT_KINDS = ['deck', 'piece', 'overlay'] as const;

function parsePlacement(v: unknown, path: string): PackPlacement {
	if (!isRecord(v)) fail(`${path} must be an object`);
	const kind = v.kind as PackPlacement['kind'];
	if (!PLACEMENT_KINDS.includes(kind)) {
		fail(`${path}.kind must be one of ${PLACEMENT_KINDS.join(', ')}`);
	}
	if (typeof v.pack !== 'string' || v.pack === '') fail(`${path}.pack must be a non-empty string`);
	if (typeof v.content !== 'string' || v.content === '') {
		fail(`${path}.content must be a non-empty string`);
	}
	const placement: PackPlacement = { kind, pack: v.pack, content: v.content };
	if (v.seat !== undefined) {
		if (typeof v.seat !== 'number' || ![0, 1, 2, 3].includes(v.seat)) {
			fail(`${path}.seat must be 0, 1, 2 or 3`);
		}
		placement.seat = v.seat as SeatIndex;
	}
	if (v.position !== undefined) placement.position = vec3(v.position, `${path}.position`);
	if (v.rotation !== undefined) placement.rotation = vec3(v.rotation, `${path}.rotation`);
	if (v.isFaceUp !== undefined) placement.isFaceUp = Boolean(v.isFaceUp);
	if (v.order !== undefined) {
		if (!Array.isArray(v.order) || v.order.some((c) => typeof c !== 'string')) {
			fail(`${path}.order must be an array of card codes`);
		}
		placement.order = v.order as string[];
	}
	if (v.shuffleOnLoad !== undefined) placement.shuffleOnLoad = Boolean(v.shuffleOnLoad);
	if (v.value !== undefined) {
		if (typeof v.value !== 'number') fail(`${path}.value must be a number`);
		placement.value = v.value;
	}
	if (v.scale !== undefined) {
		if (typeof v.scale !== 'number') fail(`${path}.scale must be a number`);
		placement.scale = v.scale;
	}
	return placement;
}

/**
 * Parse + validate a scenario file. Accepts v2 (pack-referencing), v1
 * (self-contained snapshot) and, as a v0 fallback, the legacy
 * `scenario-<name>.json` shape (no `tbps` field) so existing exports keep
 * importing. Throws a human-readable Error.
 */
export function parseScenarioFile(text: string): Scenario {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error('Not valid JSON');
	}
	if (!isRecord(raw)) {
		throw new Error('Not a scenario file: expected a JSON object');
	}
	const obj = raw;
	if (obj.tbps !== undefined && !TBPS_SUPPORTED.includes(obj.tbps as 1 | 2)) {
		throw new Error(
			`Unsupported scenario version ${JSON.stringify(obj.tbps)} — this app reads tbps ${TBPS_SUPPORTED.join(' and ')}`
		);
	}
	if (typeof obj.name !== 'string' || obj.name === '') {
		throw new Error('Not a scenario file: `name` must be a non-empty string');
	}
	// v2 may carry no ad-hoc state at all; v0/v1 always have a snapshot
	const hasPacks = obj.packs !== undefined || obj.placements !== undefined;
	if (obj.state !== undefined ? !isRecord(obj.state) : !hasPacks) {
		throw new Error('Not a scenario file: `state` must be an object');
	}

	const scenario: Scenario = {
		name: obj.name,
		createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : Date.now(),
		state: (obj.state ?? {}) as Partial<GameDTO>
	};
	if (obj.packs !== undefined) {
		if (!Array.isArray(obj.packs)) throw new Error('`packs` must be an array');
		scenario.packs = obj.packs.map((p, i) => parsePackRef(p, `packs[${i}]`));
	}
	if (obj.placements !== undefined) {
		if (!Array.isArray(obj.placements)) throw new Error('`placements` must be an array');
		scenario.placements = obj.placements.map((p, i) => parsePlacement(p, `placements[${i}]`));
	}
	return scenario;
}
