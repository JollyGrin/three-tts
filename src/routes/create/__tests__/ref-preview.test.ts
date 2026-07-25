/**
 * Turning a ref into something an `<img>` can take. The interesting half is
 * the failures: a preview that lies about a dead sheet is worse than no
 * preview, so an unslicable cell and an unparseable ref both have to come back
 * as `unresolvable` rather than as some other card's art.
 */
import { describe, expect, it, vi } from 'vitest';
import { resolveRefPreview } from '../ref-preview';
import { makeSheetRef } from '$lib/packs/resolve.svelte';

/** the CORS-tainted sheet resolves null, exactly as the real slicer does */
vi.mock('$lib/tts/slice', () => ({
	sliceCell: vi.fn(async ({ url, index }: { url: string; index: number }) =>
		url.includes('dead') ? null : `data:image/png;base64,cell${index}`
	)
}));

// jsdom has no 2d context, so the real generator can't draw — the drawing
// itself is resolve.svelte's business, this is about what comes back
vi.mock('$lib/packs/resolve.svelte', async () => {
	const actual = await vi.importActual<typeof import('$lib/packs/resolve.svelte')>(
		'$lib/packs/resolve.svelte'
	);
	return {
		...actual,
		resolveCardImage: (ref: string) => (ref === 'gen:std52/AS' ? 'data:image/png;base64,ace' : ref)
	};
});

describe('resolveRefPreview', () => {
	it('has nothing to show for an empty ref', async () => {
		expect(await resolveRefPreview('')).toEqual({ kind: 'empty' });
		expect(await resolveRefPreview('   ')).toEqual({ kind: 'empty' });
		expect(await resolveRefPreview(undefined)).toEqual({ kind: 'empty' });
	});

	it('draws a gen: ref through the resolver', async () => {
		expect(await resolveRefPreview('gen:std52/AS')).toEqual({
			kind: 'image',
			src: 'data:image/png;base64,ace'
		});
	});

	it('calls a gen: ref it cannot draw unresolvable, never the ref string', async () => {
		// the generator passes the ref back when there is nothing to draw with;
		// handing that to an <img> is a request for `/gen:std52/AS`
		expect(await resolveRefPreview('gen:nonesuch/AS')).toEqual({ kind: 'unresolvable' });
	});

	it('slices a sheet: ref to the cell it points at', async () => {
		const ref = makeSheetRef({
			url: 'https://example.test/sheet.png',
			cols: 10,
			rows: 7,
			index: 4
		});
		expect(await resolveRefPreview(ref)).toEqual({
			kind: 'image',
			src: 'data:image/png;base64,cell4'
		});
	});

	it('is unresolvable for a sheet that cannot be read, not the table fallback', async () => {
		const ref = makeSheetRef({ url: 'https://dead.test/sheet.png', cols: 2, rows: 2, index: 0 });
		expect(await resolveRefPreview(ref)).toEqual({ kind: 'unresolvable' });
	});

	it('is unresolvable for a sheet ref that is not JSON, or has no url', async () => {
		expect(await resolveRefPreview('sheet:not json at all')).toEqual({ kind: 'unresolvable' });
		expect(await resolveRefPreview('sheet:{"cols":2,"rows":2,"index":0}')).toEqual({
			kind: 'unresolvable'
		});
	});

	it('passes a URL through for the <img> to load, as the table does', async () => {
		expect(await resolveRefPreview('https://example.test/card.png')).toEqual({
			kind: 'image',
			src: 'https://example.test/card.png'
		});
		// a broken one is still an image request: only the load can tell, and
		// the thumbnail's own onerror is what turns it into "no preview"
		expect(await resolveRefPreview('https://dead.test/gone.png')).toEqual({
			kind: 'image',
			src: 'https://dead.test/gone.png'
		});
	});

	it('clamps a nonsense grid rather than dividing by zero', async () => {
		const { sliceCell } = await import('$lib/tts/slice');
		await resolveRefPreview('sheet:{"url":"https://example.test/s.png","cols":0,"rows":-3}');
		expect(sliceCell).toHaveBeenCalledWith(expect.objectContaining({ cols: 1, rows: 1, index: 0 }));
	});
});
