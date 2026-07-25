/**
 * Render-only UI state for pieces: which one the pointer is over, and where
 * the state menu is open. Nothing here is ever patched into `GameDTO` — it is
 * local to this client, exactly like `dragStore`'s hover fields.
 *
 * It lives outside Piece.svelte because both consumers are elsewhere: the
 * `X` hotkey (on `window`) needs to know what is hovered, and the state menu
 * is DOM, so it renders next to the Canvas rather than inside it.
 */

import { writable } from 'svelte/store';

/** id of the piece under the pointer, or null */
export const hoveredPiece = writable<string | null>(null);

export function setPieceHover(id: string) {
	hoveredPiece.set(id);
}

/** Only the piece that claimed the hover may release it (pointerleave order). */
export function clearPieceHover(id: string) {
	hoveredPiece.update((current) => (current === id ? null : current));
}

/** An open state menu: which piece, and the client coords to draw it at. */
export type PieceMenuState = { id: string; x: number; y: number };

export const pieceMenu = writable<PieceMenuState | null>(null);

export function openPieceMenu(id: string, x: number, y: number) {
	pieceMenu.set({ id, x, y });
}

export function closePieceMenu() {
	pieceMenu.set(null);
}
