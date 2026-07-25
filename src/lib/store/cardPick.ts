/**
 * Click-to-select on a table card.
 *
 * A single registered handler rather than a store every `Card.svelte`
 * subscribes to: only the /create editor wants a click verb on a card (jump
 * the pane's cursors to the tile you clicked), and /play must keep a plain
 * click meaning nothing at all. No handler registered = clicks stay inert.
 */
type CardPickHandler = (id: string) => void;

let handler: CardPickHandler | null = null;

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
