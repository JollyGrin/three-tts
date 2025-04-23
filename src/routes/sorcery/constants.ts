import type { GameDTO } from '$lib/store/game/types';

export const OVERLAY_SORCERY_DEFAULT: GameDTO['overlays'] = {
	sorcery: {
		id: 'sorcery',
		imageUrl: '/sorcery-grid.png',
		position: [0, 0.255, 0],
		rotation: [0, 0, 0],
		scale: 0.015,
		ratio: 1.24
	}
};

export const TOKEN_IDS = [
	'burned',
	'disabled',
	'engulfed',
	'flooded',
	'foot_soldier',
	'frog',
	'rubble',
	'wildfire_path',
  'tawny',
  'bruin',
  'lance'
];
