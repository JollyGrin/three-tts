/**
 * The editor column's width, shared by the page (which sizes the column) and
 * the pane (which is a tweakpane `width` in px, not a CSS length, so the two
 * have to agree on a number rather than on a class).
 *
 * Two steps rather than one fixed width: the column cannot shrink below its
 * pane without clipping the controls, so on a narrow window it is the felt
 * that pays. At 1280 — the width /create is expected to work at — nothing
 * changes; below 1200 the pane steps down and hands the table back ~56px,
 * which is the difference between a strip and a table on a 1024 laptop.
 */

import { readable } from 'svelte/store';

export const EDITOR_PANE_WIDE = 352;
export const EDITOR_PANE_NARROW = 296;

/** Room for the column's scrollbar, reserved whether or not it is scrolling */
export const EDITOR_GUTTER = 16;

export const EDITOR_NARROW_QUERY = '(max-width: 1199px)';

/**
 * Widest pane the viewport can afford. Falls back to the wide value wherever
 * `matchMedia` is not available (SSR, and jsdom in the component tests), which
 * is also what a component that never resizes should render.
 */
export const editorPaneWidth = readable(EDITOR_PANE_WIDE, (set) => {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
	const query = window.matchMedia(EDITOR_NARROW_QUERY);
	const apply = () => set(query.matches ? EDITOR_PANE_NARROW : EDITOR_PANE_WIDE);
	apply();
	query.addEventListener('change', apply);
	return () => query.removeEventListener('change', apply);
});
