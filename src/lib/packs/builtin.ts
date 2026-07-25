import { STANDARD_52 } from './standard52';
import type { GamePackDef } from './types';

/** `PackRef.source` value for packs shipped with the app. */
export const PACK_SOURCE_BUILTIN = 'builtin';

/** Packs shipped with the app, resolvable by id without fetching anything. */
export const BUILTIN_PACKS: Record<string, GamePackDef> = {
	[STANDARD_52.id]: STANDARD_52
};
