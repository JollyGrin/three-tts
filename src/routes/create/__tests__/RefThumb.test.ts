/**
 * The thumbnail blade itself: what a creator sees for a ref that works, a ref
 * that doesn't, and a ref they haven't typed yet. `data-state` is the tile's
 * own account of which of those it is showing.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import RefThumb from '../RefThumb.svelte';
import { makeSheetRef } from '$lib/packs/resolve.svelte';

vi.mock('$lib/tts/slice', () => ({
	sliceCell: vi.fn(async ({ url, index }: { url: string; index: number }) =>
		url.includes('dead') ? null : `data:image/png;base64,cell${index}`
	)
}));

// the Pane observes its own size; jsdom has no ResizeObserver
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

/** past the resolve debounce, plus tweakpane's own async render */
const settle = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

const tile = (container: HTMLElement) =>
	container.querySelector<HTMLElement>('[data-testid="ref-thumb"]')!;

describe('RefThumb', () => {
	it('says what is missing when no ref is set', async () => {
		const { container } = render(RefThumb, { props: { value: '', label: 'card face' } });
		await settle();
		expect(tile(container).dataset.state).toBe('empty');
		expect(container.textContent).toContain('No card face set');
	});

	it('shows a URL ref as an image the browser loads itself', async () => {
		const { container } = render(RefThumb, { props: { value: 'https://example.test/card.png' } });
		await settle();
		expect(tile(container).dataset.state).toBe('image');
		expect(tile(container).querySelector('img')?.getAttribute('src')).toBe(
			'https://example.test/card.png'
		);
	});

	it('falls back to a labelled tile when that image is a dead link', async () => {
		const { container } = render(RefThumb, { props: { value: 'https://dead.test/gone.png' } });
		await settle();
		const img = tile(container).querySelector('img')!;
		// the load failure a dead link produces, which is the only signal a plain
		// <img> gives: without this it would sit there as a broken-image icon
		img.dispatchEvent(new Event('error'));
		await settle(20);
		expect(tile(container).dataset.state).toBe('failed');
		expect(tile(container).querySelector('img')).toBeNull();
		expect(container.textContent).toContain('no preview');
	});

	it('slices a sheet: ref to its cell', async () => {
		const ref = makeSheetRef({ url: 'https://example.test/s.png', cols: 10, rows: 7, index: 2 });
		const { container } = render(RefThumb, { props: { value: ref } });
		await settle();
		expect(tile(container).dataset.state).toBe('image');
		expect(tile(container).querySelector('img')?.getAttribute('src')).toBe(
			'data:image/png;base64,cell2'
		);
	});

	it('shows "no preview" for a sheet the host will not let it read', async () => {
		const ref = makeSheetRef({ url: 'https://dead.test/s.png', cols: 2, rows: 2, index: 0 });
		const { container } = render(RefThumb, { props: { value: ref } });
		await settle();
		expect(tile(container).dataset.state).toBe('failed');
		expect(container.textContent).toContain('the table falls back the same way');
	});

	it('re-resolves when the ref changes, and drops a stale failure', async () => {
		const { container, rerender } = render(RefThumb, {
			props: { value: 'https://dead.test/gone.png' }
		});
		await settle();
		tile(container).querySelector('img')!.dispatchEvent(new Event('error'));
		await settle(20);
		expect(tile(container).dataset.state).toBe('failed');

		await rerender({ value: 'https://example.test/other.png' });
		await settle();
		expect(tile(container).dataset.state).toBe('image');
	});
});
