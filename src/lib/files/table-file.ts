/**
 * One entry point for "a table.place file arrived" — a drop on the table, or
 * a file picker.
 *
 * Which format it is comes from the in-band discriminator (`tbpp` for packs,
 * `tbps` for scenarios — docs/packs.md), never from the filename: files get
 * renamed and piped, and the routing has to survive that. Each branch then
 * goes through the format's own parser, so a corrupt file produces the same
 * field-level message an explicit import would ("decks[0].cards[3].face must
 * be a non-empty string") for the caller to surface.
 */

import { parsePackFile } from '$lib/packs/file';
import { saveLibraryPack } from '$lib/packs/library';
import { spawnPack } from '$lib/packs/spawn';
import type { GamePackDef } from '$lib/packs/types';
import { parseScenarioFile, type Scenario } from '$lib/scenario/file';
import { applyScenario, importScenarioFromText, type ApplyReport } from '$lib/scenario/scenario';

export type TableFile =
	| { kind: 'pack'; pack: GamePackDef }
	| { kind: 'scenario'; scenario: Scenario };

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Route a file's text to its format's parser. Throws the parser's own error
 * for a file of a known format that is malformed, and a naming error for
 * anything else.
 */
export function parseTableFile(text: string): TableFile {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error('Not valid JSON');
	}
	if (!isRecord(raw)) throw new Error('Not a table.place file: expected a JSON object');
	if (raw.tbpp !== undefined) return { kind: 'pack', pack: parsePackFile(text) };
	if (raw.tbps !== undefined) return { kind: 'scenario', scenario: parseScenarioFile(text) };
	// v0 scenarios (legacy `scenario-<name>.json`) predate the discriminator
	if (typeof raw.name === 'string' && isRecord(raw.state)) {
		return { kind: 'scenario', scenario: parseScenarioFile(text) };
	}
	throw new Error(
		'Not a table.place file: expected a `"tbpp": 1` (pack) or `"tbps": 2` (scenario) marker'
	);
}

export type OpenedFile =
	| { kind: 'pack'; pack: GamePackDef }
	/** `report` is absent when the caller took the scenario instead of loading it */
	| { kind: 'scenario'; scenario: Scenario; report?: ApplyReport };

export type OpenTableFileOptions = {
	/** owner for a pack's spawned content — a `seatN` placeholder on /setup */
	ownerId?: string;
	/** run before a pack spawns (e.g. seat the placeholder it will belong to) */
	beforeSpawn?: () => void;
	/** take the pack instead of spawning it — /create opens it in the editor */
	onPack?: (pack: GamePackDef) => void;
	/** take the scenario instead of loading it onto the table */
	onScenario?: (scenario: Scenario) => void;
};

/**
 * Take a file the whole way: a pack lands in the local library and spawns onto
 * the table, a scenario is saved and loaded. Both halves are the same actions
 * the panes' buttons perform, so a drop and a pick end in the same state.
 *
 * Storing is not optional — the library write and the scenario save happen
 * whatever the caller then does with the content, so "I dropped it once" is
 * enough to have it from then on.
 */
export async function openTableFile(
	text: string,
	opts: OpenTableFileOptions = {}
): Promise<OpenedFile> {
	const file = parseTableFile(text);
	if (file.kind === 'pack') {
		// library first: `spawnPack` stamps `source: 'local'` from what it finds
		// there, and that stamp is what makes a later scenario save round-trip
		saveLibraryPack(file.pack);
		if (opts.onPack) opts.onPack(file.pack);
		else {
			opts.beforeSpawn?.();
			spawnPack(file.pack, opts.ownerId ? { ownerId: opts.ownerId } : {});
		}
		return { kind: 'pack', pack: file.pack };
	}
	const scenario = importScenarioFromText(text);
	if (opts.onScenario) {
		opts.onScenario(scenario);
		return { kind: 'scenario', scenario };
	}
	return { kind: 'scenario', scenario, report: await applyScenario(scenario) };
}
