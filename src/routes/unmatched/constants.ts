import type { GameDTO } from '$lib/store/game/types';

export const OVERLAY_UNMATCHED_DEFAULT: GameDTO['overlays'] = {
	unmatched: {
		id: 'unmatched',
		imageUrl: '/unmatched-map.webp',
		position: [0, 0.255, 0],
		rotation: [0, 0, 0],
		scale: 0.05,
		ratio: 1.24
	}
};
