/**
 * Resolve a tbps v2 scenario's `packs` refs to real `GamePackDef`s.
 *
 * Three sources, no I/O for the first two: builtin refs resolve from the
 * in-app registry, `'local'` refs from this browser's pack library (the packs
 * you imported or authored — table.place hosts nothing, so this is the case
 * that makes your own content round-trip), and URL refs fetch the
 * `.tbpp.json` and go through `parsePackFile`, so a malformed remote pack
 * fails with the same field-level message as a local import.
 */

import { BUILTIN_PACKS, PACK_SOURCE_BUILTIN } from '$lib/packs/builtin';
import { getLibraryPack, PACK_SOURCE_LOCAL } from '$lib/packs/library';
import { parsePackFile } from '$lib/packs/file';
import type { GamePackDef } from '$lib/packs/types';
import type { PackRef } from './file';

export type ResolvedPacks = {
	packs: Map<string, GamePackDef>;
	/** refs that could not be resolved, with why — the caller decides how loud to be */
	failed: { ref: PackRef; reason: string }[];
};

/** Builtin refs resolve without I/O, so a builtin-only scenario needs no fetch. */
export function resolveBuiltinPack(ref: PackRef): GamePackDef | undefined {
	if (ref.source && ref.source !== PACK_SOURCE_BUILTIN) return undefined;
	return BUILTIN_PACKS[ref.id];
}

/**
 * Library refs resolve without I/O too. An un-sourced ref is also tried here:
 * scenarios saved before `'local'` existed named their pack and nothing else,
 * and the library is the only place that pack can be.
 */
export function resolveLocalPack(ref: PackRef): GamePackDef | undefined {
	if (ref.source && ref.source !== PACK_SOURCE_LOCAL) return undefined;
	return getLibraryPack(ref.id)?.pack;
}

/** Refs pointing at neither registry are URLs — anything else is a dead end. */
function isFetchable(source: string | undefined): source is string {
	return !!source && source !== PACK_SOURCE_BUILTIN && source !== PACK_SOURCE_LOCAL;
}

async function fetchPack(ref: PackRef): Promise<GamePackDef> {
	const response = await fetch(ref.source as string);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const pack = parsePackFile(await response.text());
	if (pack.id !== ref.id) {
		console.warn(
			`[scenario] ${ref.source} declares pack id '${pack.id}', scenario expects '${ref.id}'`
		);
	}
	return pack;
}

/** Why a ref that resolved nowhere failed — always naming the pack id. */
function unresolvable(ref: PackRef): string {
	if (ref.source === PACK_SOURCE_LOCAL) {
		return `pack '${ref.id}' is not in this browser's pack library — open its .tbpp.json first`;
	}
	return `no builtin or local pack '${ref.id}' and no source url`;
}

/** Resolve every ref a scenario needs. Never throws — failures are reported. */
export async function resolvePacks(refs: PackRef[]): Promise<ResolvedPacks> {
	const packs = new Map<string, GamePackDef>();
	const failed: ResolvedPacks['failed'] = [];

	await Promise.all(
		refs.map(async (ref) => {
			const known = resolveBuiltinPack(ref) ?? resolveLocalPack(ref);
			if (known) return void packs.set(ref.id, known);
			if (!isFetchable(ref.source)) return void failed.push({ ref, reason: unresolvable(ref) });
			try {
				packs.set(ref.id, await fetchPack(ref));
			} catch (error) {
				failed.push({ ref, reason: error instanceof Error ? error.message : 'fetch failed' });
			}
		})
	);

	return { packs, failed };
}
