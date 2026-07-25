/**
 * How the /create preview renders a pack's decks. A store rather than pane
 * state because two things drive it: the "Decks & Cards" pane control and the
 * `L` hotkey in +page.svelte, which is a sibling of the pane.
 *
 * Persisted next to the panes' own layout (`localStoreId`), so reopening the
 * editor puts the table back the way you left it.
 */
import { writable } from 'svelte/store';

export type PreviewLayout =
	/** one pile per deck — what /play sees, and the default */
	| 'deck'
	/** every card side by side on a derived grid (see packs/spread.ts) */
	| 'spread';

export const PREVIEW_LAYOUT_KEY = 'create-pane-layout';

function read(): PreviewLayout {
	try {
		return localStorage.getItem(PREVIEW_LAYOUT_KEY) === 'spread' ? 'spread' : 'deck';
	} catch {
		return 'deck'; // no localStorage (SSR / prerender)
	}
}

export const previewLayout = writable<PreviewLayout>(read());

previewLayout.subscribe((mode) => {
	try {
		localStorage.setItem(PREVIEW_LAYOUT_KEY, mode);
	} catch {
		/* nothing to persist to */
	}
});

export function togglePreviewLayout(): PreviewLayout {
	let next: PreviewLayout = 'deck';
	previewLayout.update((mode) => (next = mode === 'deck' ? 'spread' : 'deck'));
	return next;
}
