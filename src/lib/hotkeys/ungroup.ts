import toast from 'svelte-french-toast';
import { gameActions } from '$lib/store/game/actions';
import { UNGROUP_MAX_CARDS } from '$lib/store/game/actions/deck';

/**
 * `Shift+G` on a hovered deck: spread it back into loose cards.
 *
 * Shared by /play and /setup so the refusal wording — the only place the
 * card cap is visible while playing — is written once.
 */
export function ungroupHoveredDeck() {
	const result = gameActions.ungroupDeck();
	if (result.ok) return result;

	switch (result.reason) {
		// nothing under the pointer: Shift+G was aimed at a card, not a deck.
		// Silent — a toast on every stray keypress is noise.
		case 'no-deck':
			break;
		case 'not-mine':
			toast.error("That deck isn't yours to spread");
			break;
		case 'empty':
			toast.error('That deck is empty');
			break;
		case 'too-many':
			toast.error(
				`${result.count} cards is too many to spread — Shift+G is capped at ${UNGROUP_MAX_CARDS}`
			);
			break;
	}
	return result;
}
