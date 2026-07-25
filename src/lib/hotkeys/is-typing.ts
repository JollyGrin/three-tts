/**
 * Is this key event landing in a text field?
 *
 * Every table route binds bare letters as gestures on `svelte:window`, and the
 * panes are full of text — codes, names, lobby ids, image URLs. Tweakpane does
 * not stop propagation, so a key typed into a field still reaches the window
 * handler: naming a scenario `flag-game` would otherwise flip a card, group a
 * pile and reset the camera. A key that lands in a field is text, not a table
 * command.
 *
 * Call it first in both `handleKeyDown` and `handleKeyUp` — a latch like Space's
 * preview HUD needs the release guarded too, or it sticks on.
 */
export function isTyping(target: EventTarget | null) {
	const element = target as HTMLElement | null;
	if (!element) return false;
	// coerced: `isContentEditable` is absent (undefined) outside a real browser
	return Boolean(
		element.tagName === 'INPUT' ||
			element.tagName === 'TEXTAREA' ||
			element.tagName === 'SELECT' ||
			element.isContentEditable
	);
}
