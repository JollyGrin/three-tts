/**
 * What the pane can SHOW for a ref it is editing.
 *
 * A face ref is one opaque string (`https://…`, `gen:std52/AS`, `sheet:{…}`),
 * and until now the only feedback the editor gave for one was the string
 * itself. This turns a ref into something an `<img>` can take, through the
 * same art path the table uses: `resolveCardImage` for `gen:`, the sheet
 * slicer for `sheet:`, and the URL itself for everything else — which is
 * exactly what the table hands to its material.
 *
 * Two deliberate departures from `resolveCardImage` for `sheet:` refs, which
 * is why they go to `sliceCell` directly (as BulkSheet's grid does):
 *
 * - a dead or CORS-blocked sheet resolves there to a NAMED PROXY CARD. That is
 *   the right answer for the table, and the wrong one for a preview whose
 *   whole job is to say whether the art is there — a drawn proxy would read as
 *   "your ref works".
 * - a pending slice resolves to `''`, which is indistinguishable from failure.
 *   Here they must look different: one is a spinner, the other is an answer.
 */

import { resolveCardImage } from '$lib/packs/resolve.svelte';
import { sliceCell } from '$lib/tts/slice';
import { resolveModelRef } from '$lib/models/catalog';
import { ensureModelCatalog } from '$lib/models/catalog-store';

export type RefPreview =
	/** nothing typed yet — not a failure, just no art to show */
	| { kind: 'empty' }
	/** a sheet cell is being fetched and cut */
	| { kind: 'pending' }
	/** hand this to an `<img>`; it may still fail to LOAD (dead link) */
	| { kind: 'image'; src: string }
	/** the ref cannot produce an image at all */
	| { kind: 'unresolvable' };

/**
 * How long the ref sits still before it is resolved. Refs are typed a
 * character at a time, and every prefix of a sheet URL is a fetch.
 */
export const PREVIEW_DEBOUNCE_MS = 250;

function grid(value: unknown): number {
	const n = Math.round(Number(value));
	return Number.isFinite(n) && n > 0 ? n : 1;
}

/** the four fields the slicer needs, or null if this isn't a usable sheet ref */
function parseSheetCell(ref: string) {
	try {
		const payload = JSON.parse(ref.slice('sheet:'.length));
		const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
		if (!url) return null;
		const index = Math.round(Number(payload?.index));
		return {
			url,
			cols: grid(payload?.cols),
			rows: grid(payload?.rows),
			index: Number.isFinite(index) && index > 0 ? index : 0
		};
	} catch {
		// a hand-written `sheet:` ref that isn't JSON — still a valid string to
		// keep in the pack (parseFaceRef preserves it), just not a previewable one
		return null;
	}
}

/** Resolve a ref to something the thumbnail can render. */
export async function resolveRefPreview(ref: string | undefined | null): Promise<RefPreview> {
	const value = (ref ?? '').trim();
	if (!value) return { kind: 'empty' };

	if (value.startsWith('gen:')) {
		const src = resolveCardImage(value);
		// the generator hands the ref straight back when it can't draw (an
		// unknown generator, or no 2d context) — that string is not an image
		return src && src !== value ? { kind: 'image', src } : { kind: 'unresolvable' };
	}

	if (value.startsWith('sheet:')) {
		const cell = parseSheetCell(value);
		if (!cell) return { kind: 'unresolvable' };
		const src = await sliceCell(cell);
		return src ? { kind: 'image', src } : { kind: 'unresolvable' };
	}

	// a model ref's preview is its pre-rendered catalog thumbnail — the GLB is
	// never loaded for a thumb. Unknown kit/model (or no manifest) is exactly
	// the "cannot produce an image" answer.
	if (value.startsWith('model:')) {
		const resolved = resolveModelRef(await ensureModelCatalog(), value);
		return resolved ? { kind: 'image', src: resolved.thumbUrl } : { kind: 'unresolvable' };
	}

	// every other ref is a URL the table loads as-is, so the preview loads it
	// as-is too — no proxy, no canvas, and no CORS requirement for display
	return { kind: 'image', src: value };
}
