/**
 * Face refs, in the two directions the editor needs them.
 *
 * A tbpp face is one opaque string (`https://…`, `gen:std52/AS`,
 * `sheet:{…}`). The pane edits it as fields, so it has to be able to take a
 * ref apart as well as build one — `parseFaceRef` picks the scheme a stored
 * ref was written in, `buildFaceRef` puts the fields back together.
 * Round-tripping a ref through both is a no-op, which is what lets the inline
 * editor sit directly on a card without a separate "apply" step.
 */

import { makeSheetRef } from '$lib/packs/resolve.svelte';

export type FaceScheme = 'url' | 'gen' | 'sheet';

export const FACE_SCHEME_OPTIONS: Record<string, FaceScheme> = {
	'Image URL (https:)': 'url',
	'Generated (gen:std52)': 'gen',
	'Sprite sheet (sheet:)': 'sheet'
};

/** `sheet:` payload — mirrors resolve.svelte's private shape */
export type SheetPayload = {
	url: string;
	cols: number;
	rows: number;
	index: number;
	name?: string;
	back?: boolean;
};

export interface FaceDraft {
	scheme: FaceScheme;
	/** raw ref for the `url` scheme (anything the resolver passes through) */
	url: string;
	/** card code for the `gen:std52/` scheme */
	genCode: string;
	sheetUrl: string;
	sheetCols: number;
	sheetRows: number;
	sheetIndex: number;
	/**
	 * The rest of an imported sheet payload (`name`, `back`), kept so editing
	 * one cell index doesn't throw away a TTS import's dead-art fallback.
	 */
	sheetExtra: Partial<SheetPayload>;
}

export const SHEET_DEFAULTS = { cols: 10, rows: 7, index: 0 } as const;

function emptyDraft(scheme: FaceScheme): FaceDraft {
	return {
		scheme,
		url: '',
		genCode: 'AS',
		sheetUrl: '',
		sheetCols: SHEET_DEFAULTS.cols,
		sheetRows: SHEET_DEFAULTS.rows,
		sheetIndex: SHEET_DEFAULTS.index,
		sheetExtra: {}
	};
}

/** Split a stored face ref into editable fields. Unparseable refs stay raw. */
export function parseFaceRef(ref: string | undefined | null): FaceDraft {
	const value = (ref ?? '').trim();
	if (!value) return emptyDraft('url');

	if (value.startsWith('gen:std52/')) {
		return { ...emptyDraft('gen'), genCode: value.slice('gen:std52/'.length) };
	}

	if (value.startsWith('sheet:')) {
		try {
			const { url, cols, rows, index, ...rest } = JSON.parse(
				value.slice('sheet:'.length)
			) as Partial<SheetPayload>;
			return {
				...emptyDraft('sheet'),
				sheetUrl: url ?? '',
				sheetCols: cols ?? SHEET_DEFAULTS.cols,
				sheetRows: rows ?? SHEET_DEFAULTS.rows,
				sheetIndex: index ?? SHEET_DEFAULTS.index,
				sheetExtra: rest
			};
			// a hand-written sheet ref that isn't JSON is still a valid string to
			// keep — surface it as-is rather than silently blanking the card
		} catch {
			return { ...emptyDraft('url'), url: value };
		}
	}

	return { ...emptyDraft('url'), url: value };
}

/** Put the fields back together into the ref that goes in the pack. */
export function buildFaceRef(draft: FaceDraft): string {
	if (draft.scheme === 'url') return draft.url.trim();
	if (draft.scheme === 'gen') {
		const code = draft.genCode.trim();
		return code ? `gen:std52/${code}` : '';
	}
	if (!draft.sheetUrl.trim()) return '';
	// the spread is last on purpose: `sheetExtra` never holds the four fields
	// above (parse takes them out), so this only appends `name` / `back`
	return makeSheetRef({
		url: draft.sheetUrl.trim(),
		cols: Math.max(1, Math.round(draft.sheetCols)),
		rows: Math.max(1, Math.round(draft.sheetRows)),
		index: Math.max(0, Math.round(draft.sheetIndex)),
		...draft.sheetExtra
	});
}
