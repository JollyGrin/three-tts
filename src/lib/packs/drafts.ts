/**
 * Pack drafts: save in-progress `GamePackDef`s from the /create editor to
 * localStorage (`packs:v1`, mirroring `scenarios:v1` in scenario.ts).
 * Drafts are local working copies — sharing happens via .tbpp.json export.
 */

import type { GamePackDef } from './types';

const STORAGE_KEY = 'packs:v1';

export type PackDraft = {
	updatedAt: number;
	pack: GamePackDef;
};

function readAll(): Record<string, PackDraft> {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

function writeAll(all: Record<string, PackDraft>) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function listPackDrafts(): PackDraft[] {
	return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPackDraft(id: string): PackDraft | undefined {
	return readAll()[id];
}

export function savePackDraft(pack: GamePackDef): PackDraft {
	const draft: PackDraft = { updatedAt: Date.now(), pack };
	const all = readAll();
	all[pack.id] = draft;
	writeAll(all);
	return draft;
}

export function deletePackDraft(id: string) {
	const all = readAll();
	delete all[id];
	writeAll(all);
}
