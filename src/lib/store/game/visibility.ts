/**
 * Client-side reading of the visibility model (see `CardVisibility` in
 * types.ts). The server is what actually enforces secrecy — it never sends a
 * face you are not entitled to — so these helpers exist to render the right
 * thing, not to protect anything.
 *
 * Rendering keys off *this*, never off rotation: a facedown card you peeked at
 * and a facedown card you have never seen look identical on the table but read
 * differently in the preview HUD.
 */

import type { CardVisibility, GameDTO } from './types';

type Card = Partial<GameDTO['cards'][string]> | null | undefined;

/** 180° on the x axis = the table is looking at the card's back. */
export const FACEDOWN_ROTATION_X = 180;

export function isFacedown(card: Card): boolean {
	return card?.rotation?.[0] === FACEDOWN_ROTATION_X;
}

/**
 * Resolve a card's visibility, falling back to orientation when the descriptor
 * is missing (local scenario editing, state authored before the field existed).
 * The fallback is deliberately the cautious one — unlabelled and facedown means
 * hidden.
 */
export function visibilityOf(card: Card): CardVisibility {
	if (card?.visibility?.kind === 'public') return { kind: 'public' };
	if (card?.visibility?.kind === 'hidden') return card.visibility;
	return isFacedown(card) ? { kind: 'hidden' } : { kind: 'public' };
}

/** Is this player entitled to the card's face? */
export function canSeeFace(card: Card, playerId?: string | null): boolean {
	const visibility = visibilityOf(card);
	if (visibility.kind === 'public') return true;
	return !!playerId && !!visibility.seenBy?.includes(playerId);
}

/** Hidden from this player — the face is (and must stay) unavailable. */
export function isHiddenFrom(card: Card, playerId?: string | null): boolean {
	return !canSeeFace(card, playerId);
}

/**
 * The face url to render, or undefined when there is nothing you may show.
 * A card you may not see has no `faceImageUrl` in the first place; the
 * visibility check is the belt to that braces.
 */
export function faceFor(card: Card, playerId?: string | null): string | undefined {
	if (!canSeeFace(card, playerId)) return undefined;
	return card?.faceImageUrl || undefined;
}

/** Someone else is dragging this object — hands off. */
export function isHeldByOther(
	object: { heldBy?: string } | null | undefined,
	playerId?: string | null
): boolean {
	return !!object?.heldBy && object.heldBy !== playerId;
}
