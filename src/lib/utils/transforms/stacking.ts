import type { GameDTO } from '$lib/store/game/types';
import {
	CARD_REST_Y,
	CARD_THICKNESS,
	CARD_STACK_RADIUS,
	CARD_STACK_MAX_Y
} from '$lib/utils/constants-cards';

/**
 * Resolve the resting height for a card dropped at (x, z).
 *
 * Cards overlapping the drop point stack on top of each other with one
 * thickness of separation instead of all resting at the same y — two
 * coplanar cards z-fight no matter how precise the depth buffer is.
 */
export function resolveStackHeight(
	cards: GameDTO['cards'] | undefined,
	droppedId: string,
	x: number,
	z: number
): number {
	let top: number | null = null;
	const radiusSq = CARD_STACK_RADIUS * CARD_STACK_RADIUS;

	for (const [id, card] of Object.entries(cards ?? {})) {
		if (id === droppedId || !card?.position) continue;
		const [cx, cy, cz] = card.position;
		if (cy > CARD_STACK_MAX_Y) continue; // mid-drag/animation, not resting
		const dx = cx - x;
		const dz = cz - z;
		if (dx * dx + dz * dz > radiusSq) continue;
		if (top === null || cy > top) top = cy;
	}

	return top === null ? CARD_REST_Y : top + CARD_THICKNESS;
}
