/**
 * Click-to-select on a table card.
 *
 * A single registered handler rather than a store every `Card.svelte`
 * subscribes to: only the /create editor wants a click verb on a card (jump
 * the pane's cursors to the tile you clicked), and /play must keep a plain
 * click meaning nothing at all. No handler registered = clicks stay inert.
 */
import { writable } from 'svelte/store';

type CardPickHandler = (id: string) => void;

let handler: CardPickHandler | null = null;

/**
 * The other direction: the card the editor currently has SELECTED, by entity
 * id. `Card.svelte` lifts it off the felt and draws a pad under it, so
 * changing the Card dropdown has a visible answer on the table and selection
 * reads both ways (#109).
 *
 * A store rather than a second registered handler, because this one is read by
 * every card on the table instead of called on one. Left `null` on every route
 * but /create, which is why nothing is ever marked at /play.
 */
export const pickedCard = writable<string | null>(null);

/** Register the handler; returns an unregister for the caller's cleanup. */
export function onCardPick(next: CardPickHandler): () => void {
	handler = next;
	return () => {
		if (handler === next) handler = null;
	};
}

/** Called by Card.svelte for a click that wasn't a drag. */
export function pickCard(id: string) {
	handler?.(id);
}
