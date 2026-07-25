/**
 * The local pack library: every `GamePackDef` this browser knows about, in
 * localStorage (`packs:v1`, mirroring `scenarios:v1` in scenario.ts).
 *
 * It started as /create's draft store and is now the registry every route
 * reads: /create edits from it, /setup and /play spawn from it, and
 * `resolve-packs.ts` resolves a scenario's `source: 'local'` refs against it —
 * which is what lets a pack you authored survive a scenario save/load without
 * being hosted anywhere.
 *
 * Device-local by construction. A scenario exported to someone who does not
 * have the pack fails loudly, naming the id; sharing the pack itself is still
 * a `.tbpp.json` export.
 */

import type { GamePackDef } from './types';

const STORAGE_KEY = 'packs:v1';

/** `PackRef.source` value for packs held in this browser's library. */
export const PACK_SOURCE_LOCAL = 'local';

export type LibraryPack = {
	updatedAt: number;
	pack: GamePackDef;
};

function readAll(): Record<string, LibraryPack> {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

function writeAll(all: Record<string, LibraryPack>) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function listLibraryPacks(): LibraryPack[] {
	return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLibraryPack(id: string): LibraryPack | undefined {
	return readAll()[id];
}

/** Cheap membership test — `spawnPack` asks this for every entity it stamps. */
export function hasLibraryPack(id: string): boolean {
	return readAll()[id] !== undefined;
}

export function saveLibraryPack(pack: GamePackDef): LibraryPack {
	const entry: LibraryPack = { updatedAt: Date.now(), pack };
	const all = readAll();
	all[pack.id] = entry;
	writeAll(all);
	return entry;
}

export function deleteLibraryPack(id: string) {
	const all = readAll();
	delete all[id];
	writeAll(all);
}
