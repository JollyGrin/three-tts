import { get } from 'svelte/store';
import { dragEnd, dragStore } from '$lib/store/dragStore.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { withIntent } from '$lib/store/game/intents';
import { tableFeatures } from '$lib/store/tableFeatures';
import { modelSurfaceYAt } from '$lib/models/surface';
import { resolveDrop, type DropTarget } from '$lib/utils/transforms/drop';

/**
 * Ending a drag, in one place.
 *
 * Every release funnels through `commitActiveDrag` — the table mesh's
 * pointerup and the window-level fallback for releases that never reach it
 * (pointer left the canvas, or came up over the HUD). The window listener
 * runs last in the bubble order, so a normal on-table release has already
 * cleared `isDragging` by the time it fires and it no-ops.
 */
export function commitActiveDrag() {
	const {
		isDragging: id,
		intersectionPoint,
		isDeckHovered,
		isBagHovered,
		isTrayHovered,
		noSnap
	} = get(dragStore);
	if (!id) return;

	// resolved by the same pure function the DropIndicator previews with, so
	// what the player saw while dragging is what gets committed — including
	// whether Alt was down (noSnap), which the release writes into the store
	// from the pointer event before calling in, and whether this route has a
	// hand at all. The options must match the indicator's exactly.
	const drop = resolveDrop(
		get(gameStore),
		id,
		intersectionPoint,
		{ deckId: isDeckHovered, bagId: isBagHovered, tray: isTrayHovered },
		// surfaceYAt: model meshes redefine the local floor (excluding the piece
		// being dragged, which floats over its own drop point). The indicator
		// passes the identical callback, keeping the preview honest.
		{ noSnap, hand: get(tableFeatures).hand, surfaceYAt: modelSurfaceYAt(id) }
	);

	if (drop?.kind === 'tray') {
		gameActions.moveCardToTray(id, gameActions?.getMe()?.id as string);
	} else if (drop?.kind === 'deck' && drop.targetId) {
		gameActions.placeOnTopOfDeck(drop.targetId, id);
	} else if (drop?.kind === 'bag' && drop.targetId) {
		// the bag can refuse (it was emptied of its target, or removed, by another
		// client between the preview and this release) — then the entity has to
		// land somewhere rather than stay floating at drag height
		if (!gameActions.returnToBag(drop.targetId, id)) commitActiveDragAtRest(id);
	} else if (drop) {
		land(id, dropPatch(drop));
	}

	dragEnd();
}

/** What a landing writes: position, and rotation when the drop turned it. */
type Landing = { position: [number, number, number]; rotation?: [number, number, number] };

/**
 * A landing on plain felt — the one branch of a release with no `gameActions`
 * verb behind it. Named for the intent channel (tableplace-169) so a drag reads
 * as `moveEntity` in a game log rather than as an anonymous position patch; the
 * tray / deck / bag landings above already carry verbs of their own.
 *
 * The per-frame positions a drag streams while it is in flight are deliberately
 * NOT named: they go straight to `gameStore.updateState` from TableScene, and a
 * verb per pointer move is a flood, not a log. Only where it comes to rest is
 * an intent.
 */
const land = withIntent('moveEntity', (id: string, patch: Landing) => {
	if (id.startsWith('piece:')) gameStore.updateState({ pieces: { [id]: patch } });
	else if (id.startsWith('deck:')) gameStore.updateState({ decks: { [id]: patch } });
	else gameStore.updateState({ cards: { [id]: patch } });
});

/**
 * The state patch a landing writes. Position always; rotation only when the
 * drop actually turned the entity — a snap point with an authored yaw. Every
 * other kind resolves the rotation the entity already has, and re-sending it
 * would put an unchanged field on the wire on every single drop.
 */
function dropPatch(drop: DropTarget): Landing {
	return drop.snap?.rotation !== undefined
		? { position: drop.position, rotation: drop.rotation }
		: { position: drop.position };
}

/**
 * Esc mid-drag: put the entity back where it was picked up and drop the drag.
 * Without a recorded origin (a card drawn out of a deck or tray never had a
 * table position) the next best thing is to let it settle where it floats,
 * which at least never leaves it stuck in the air.
 */
export function cancelActiveDrag() {
	const { isDragging: id, origin } = get(dragStore);
	if (!id) return;

	if (!origin) {
		// settle in place: resolve against the entity's own XZ, not the pointer
		commitActiveDragAtRest(id);
		return;
	}

	land(id, { position: origin });

	dragEnd();
}

function commitActiveDragAtRest(id: string) {
	const drop = resolveDrop(get(gameStore), id, null, {}, { surfaceYAt: modelSurfaceYAt(id) });
	if (drop) land(id, dropPatch(drop));
	dragEnd();
}
