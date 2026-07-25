/**
 * The Deck/Spread choice outlives the page, like the panes' own positions —
 * so the module is re-imported here rather than reset, which is the closest a
 * test gets to a reload.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { PREVIEW_LAYOUT_KEY } from '../preview-layout';

async function reload() {
	vi.resetModules();
	return import('../preview-layout');
}

describe('previewLayout', () => {
	beforeEach(() => localStorage.clear());

	it('starts a fresh editor in Deck mode', async () => {
		const { previewLayout } = await reload();
		expect(get(previewLayout)).toBe('deck');
	});

	it('remembers Spread across a reload', async () => {
		const first = await reload();
		expect(first.togglePreviewLayout()).toBe('spread');
		expect(localStorage.getItem(PREVIEW_LAYOUT_KEY)).toBe('spread');

		const second = await reload();
		expect(get(second.previewLayout)).toBe('spread');
		expect(second.togglePreviewLayout()).toBe('deck');
		expect(get((await reload()).previewLayout)).toBe('deck');
	});

	it('falls back to Deck on a junk stored value', async () => {
		localStorage.setItem(PREVIEW_LAYOUT_KEY, 'sideways');
		expect(get((await reload()).previewLayout)).toBe('deck');
	});
});
