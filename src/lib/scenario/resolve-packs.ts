/**
 * Resolve a tbps v2 scenario's `packs` refs to real `GamePackDef`s.
 *
 * Builtin refs resolve from the in-app registry (no I/O); URL refs fetch the
 * `.tbpp.json` and go through `parsePackFile`, so a malformed remote pack
 * fails with the same field-level message as a local import.
 */

import { BUILTIN_PACKS, PACK_SOURCE_BUILTIN } from '$lib/packs/builtin';
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

/** Resolve every ref a scenario needs. Never throws — failures are reported. */
export async function resolvePacks(refs: PackRef[]): Promise<ResolvedPacks> {
	const packs = new Map<string, GamePackDef>();
	const failed: ResolvedPacks['failed'] = [];

	await Promise.all(
		refs.map(async (ref) => {
			const builtin = resolveBuiltinPack(ref);
			if (builtin) return void packs.set(ref.id, builtin);
			if (!ref.source || ref.source === PACK_SOURCE_BUILTIN) {
				return void failed.push({ ref, reason: `no builtin pack '${ref.id}' and no source url` });
			}
			try {
				packs.set(ref.id, await fetchPack(ref));
			} catch (error) {
				failed.push({ ref, reason: error instanceof Error ? error.message : 'fetch failed' });
			}
		})
	);

	return { packs, failed };
}
