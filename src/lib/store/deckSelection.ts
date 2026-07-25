import { writable } from 'svelte/store';

/**
 * Which deck the scenario editor is currently pointing its `position` /
 * `rotation` controls at, so the scene can say so on the table (#114).
 *
 * A store rather than a prop for the same reason `snapEditor` is one: the pane
 * lives outside the `<Canvas>`, and the thing that has to react is a `Deck`
 * several components deep inside it.
 *
 * Only /setup ever sets this — it clears on unmount, so a deck never wears an
 * editing outline in /play.
 */
export const selectedDeckId = writable<string | null>(null);

export function setSelectedDeck(id: string | null) {
	selectedDeckId.set(id);
}

/**
 * Editing outline colour. Deliberately clear of the scene's other signal
 * colours — the cyan drop highlight (#5ee7ff), the amber stack highlight
 * (#ffc94a) and the violet snap-point markers — so "this is the deck the pane
 * is editing" never reads as "drop here".
 */
export const DECK_SELECT_COLOR = '#a3e635';
