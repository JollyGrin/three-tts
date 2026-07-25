import type { GameDTO } from '$lib/store/game/types';
import { TABLE_FEATURES_DEFAULT, type TableFeatures } from '$lib/store/tableFeatures';
import {
	CARD_WIDTH,
	CARD_HEIGHT,
	CARD_REST_Y,
	deckHeightForCount
} from '$lib/utils/constants-cards';
import { PIECE_DEFAULT_RADIUS, PIECE_REST_Y } from '$lib/utils/constants-pieces';
import { EDGE_MARGIN, TABLE_HALF_X, TABLE_HALF_Z, TABLE_TOP_Y } from '$lib/utils/constants-table';
import { resolveStack } from './stacking';
import { applySnapRotation, resolveSnap, type SnapResolution } from './snap';

export type DropKind =
	/** lands on bare felt (or an overlay) */
	| 'table'
	/** lands on top of one or more cards already at that spot */
	| 'stack'
	/** caught by an authored snap point: lands exactly on it */
	| 'snap'
	/** returns to a deck instead of the table */
	| 'deck'
	/** goes into the local player's hand tray */
	| 'tray';

export type DropFootprint =
	| { shape: 'rect'; w: number; h: number }
	| { shape: 'circle'; r: number };

export interface DropTarget {
	kind: DropKind;
	/** deck id when kind === 'deck' */
	targetId?: string;
	/** where the entity's origin ends up — exactly what the commit writes */
	position: [number, number, number];
	/** the entity's rotation on landing (degrees, matching the DTOs) */
	rotation: [number, number, number];
	/** shape of the shadow the entity casts on the surface it lands on */
	footprint: DropFootprint;
	/**
	 * Height to draw the footprint at. Same as `position[1]` for cards (they
	 * lie flat), but the table surface for pieces — a token's origin sits half
	 * a disc above the felt, and the footprint belongs on the felt.
	 */
	footprintY: number;
	/**
	 * Set when `kind === 'snap'`: the point that caught the drop — its id, its
	 * catch radius (the preview draws it), and the yaw it authored, if any, so
	 * the commit can tell "this drop turned the entity" from "this drop only
	 * moved it" without diffing rotations.
	 */
	snap?: { id: string; radius: number; rotation?: number };
}

export interface DropHover {
	/** id of the deck currently under the pointer, if any */
	deckId?: string | null;
	/** whether the pointer is over the hand tray */
	tray?: boolean;
}

export interface DropOptions {
	/**
	 * Alt held at release: place the card exactly where the pointer is, with
	 * no XZ square-up onto a nearby pile, no stack-height merge, and no pull
	 * onto an authored snap point. The escape hatch for laying cards out next
	 * to each other on purpose.
	 */
	noSnap?: boolean;
	/**
	 * Whether the route mounted a hand tray (see `store/tableFeatures`).
	 * Defaults to true; `/create` passes false, and then a tray hover — which
	 * can arrive stale from a previous `/play` visit, the flag being
	 * module-global — can't win a drop the editor has no way to represent.
	 */
	hand?: TableFeatures['hand'];
}

/** What the caught drop reports back about the point that caught it. */
function snapInfo(snap: SnapResolution): NonNullable<DropTarget['snap']> {
	return {
		id: snap.id,
		radius: snap.radius,
		...(snap.rotation !== undefined ? { rotation: snap.rotation } : {})
	};
}

/** Keep a drop a margin inside the felt edge. */
export function clampToTable(x: number, z: number): [number, number] {
	return [
		Math.min(Math.max(x, -TABLE_HALF_X + EDGE_MARGIN), TABLE_HALF_X - EDGE_MARGIN),
		Math.min(Math.max(z, -TABLE_HALF_Z + EDGE_MARGIN), TABLE_HALF_Z - EDGE_MARGIN)
	];
}

/**
 * Resolve where the entity currently being dragged would land if it were
 * released right now.
 *
 * This is the single source of truth for the drop: `DropIndicator` draws it
 * and `Table.handleDragEnd` commits it, so the preview cannot promise a
 * landing the release won't honour.
 *
 * `rawPoint` is the unclamped table raycast hit; when it's missing (pointer
 * off the table plane) the entity's own position is used instead so a drag
 * keeps previewing.
 *
 * Pieces and whole decks only ever settle, so they resolve first: felt position,
 * pulled onto an authored snap point if one catches them. For a card the order
 * is, most explicit first: the hand tray, then a hovered deck (both aimed at),
 * then Alt's opt-out, then an authored snap point within radius, then the
 * loose-pile square-up. A snap point beats a pile because it is authored intent
 * rather than a side effect of where cards drifted; Alt opts out of every kind
 * of snapping at once.
 *
 * `options` carries what the release itself asks for (`noSnap`, from Alt) and
 * what the route actually mounted (`hand`): a target that isn't on screen
 * can't win a drop, even if a stale hover flag says the pointer is over it.
 * Both call sites — the indicator's preview and the commit — pass the same
 * object, which is what keeps the preview honest.
 */
export function resolveDrop(
	state: Partial<GameDTO> | undefined | null,
	dragId: string | null | undefined,
	rawPoint: { x: number; z: number } | null | undefined,
	hover: DropHover = {},
	options: DropOptions = {}
): DropTarget | null {
	const hasHand = options.hand ?? TABLE_FEATURES_DEFAULT.hand;
	if (!dragId) return null;

	const isPiece = dragId.startsWith('piece:');
	const isDeck = dragId.startsWith('deck:');
	const entity = isPiece
		? state?.pieces?.[dragId]
		: isDeck
			? state?.decks?.[dragId]
			: state?.cards?.[dragId];
	if (!entity) return null;

	const [ex = 0, , ez = 0] = entity.position ?? [];
	const [x, z] = clampToTable(rawPoint?.x ?? ex, rawPoint?.z ?? ez);
	const rotation = (entity.rotation ?? [0, 0, 0]) as [number, number, number];

	// An authored snap point pulls the landing onto itself. Alt opts out — it is
	// already the "put it exactly where I said" modifier — and the aimed-at
	// targets (deck, tray, checked below for cards) still beat proximity.
	const snap = options.noSnap ? null : resolveSnap(state?.snapPoints, x, z);

	// pieces don't stack, join decks, or enter the tray — they just settle
	if (isPiece) {
		const r = ('radius' in entity ? entity.radius : undefined) ?? PIECE_DEFAULT_RADIUS;
		const [px, pz] = snap ? [snap.x, snap.z] : [x, z];
		return {
			kind: snap ? 'snap' : 'table',
			position: [px, PIECE_REST_Y, pz],
			rotation: applySnapRotation(rotation, snap?.rotation, 'piece'),
			footprint: { shape: 'circle', r },
			footprintY: TABLE_TOP_Y,
			...(snap ? { snap: snapInfo(snap) } : {})
		};
	}

	// decks don't nest, stack, or enter the tray: a dragged pile settles on
	// the felt wherever it's pointed, centred at half its body height (the
	// group origin is the slab's middle, not its base) — or exactly on an
	// authored snap point when one catches it.
	//
	// A snap only ever moves the deck in XZ and turns it: `restY` stays its own
	// half-height, because a deck landing on an occupied point still doesn't
	// stack. And the yaw goes in as radians here, unlike a card's — see
	// applySnapRotation.
	if (isDeck) {
		const count = ('cards' in entity ? entity.cards : undefined)?.length ?? 0;
		const restY = TABLE_TOP_Y + deckHeightForCount(count) / 2;
		const [dx, dz] = snap ? [snap.x, snap.z] : [x, z];
		return {
			kind: snap ? 'snap' : 'table',
			position: [dx, restY, dz],
			rotation: applySnapRotation(rotation, snap?.rotation, 'deck'),
			footprint: { shape: 'rect', w: CARD_WIDTH, h: CARD_HEIGHT },
			footprintY: TABLE_TOP_Y,
			...(snap ? { snap: snapInfo(snap) } : {})
		};
	}

	const footprint = { shape: 'rect', w: CARD_WIDTH, h: CARD_HEIGHT } as const;

	// the tray wins over a deck: dropping into your hand is the more explicit
	// gesture, and the two hover states can briefly overlap. No hand on this
	// route (the pack editor) and the card just lands on the table instead.
	if (hover.tray && hasHand) {
		return {
			kind: 'tray',
			position: [x, CARD_REST_Y, z],
			rotation,
			footprint,
			footprintY: CARD_REST_Y
		};
	}

	if (hover.deckId) {
		const deck = state?.decks?.[hover.deckId];
		const [dx, , dz] = deck?.position ?? [x, CARD_REST_Y, z];
		return {
			kind: 'deck',
			targetId: hover.deckId,
			position: [dx, CARD_REST_Y, dz],
			rotation: (deck?.rotation ?? rotation) as [number, number, number],
			footprint,
			footprintY: CARD_REST_Y
		};
	}

	// Alt beats the pile: commit at the pointer, resting on the felt rather
	// than merging into whatever the card happens to overlap. Checked after
	// the deck and tray, which are aimed-at targets rather than a side effect
	// of proximity.
	if (options.noSnap) {
		return {
			kind: 'table',
			position: [x, CARD_REST_Y, z],
			rotation,
			footprint,
			footprintY: CARD_REST_Y
		};
	}

	// A caught card commits on the point exactly, but still stacks: the resting
	// height comes from whatever is already sitting there, so a second card on
	// the same snap point lands on top of the first instead of inside it.
	if (snap) {
		const stack = resolveStack(state?.cards, dragId, snap.x, snap.z);
		return {
			kind: 'snap',
			position: [snap.x, stack.restY, snap.z],
			rotation: applySnapRotation(rotation, snap.rotation, 'card'),
			footprint,
			footprintY: stack.restY,
			snap: snapInfo(snap)
		};
	}

	// landing on a pile squares up to its base XZ (resolveStack), so cards
	// dropped roughly together settle into a neat stack instead of a fan
	const stack = resolveStack(state?.cards, dragId, x, z);
	return {
		kind: stack.count > 0 ? 'stack' : 'table',
		position: [stack.x, stack.restY, stack.z],
		rotation,
		footprint,
		footprintY: stack.restY
	};
}
