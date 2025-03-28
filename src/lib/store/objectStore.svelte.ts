import * as THREE from 'three';
import { writable, get } from 'svelte/store';

export interface CardState {
	position: [number, number, number];
	rotation: [number, number, number];
	faceImageUrl: string;
	backImageUrl?: string;
}

type CardsState = Record<string, CardState>;

const cards = writable<CardsState>({});

function updateCardState(
	id: string,
	position: [number, number, number],
	_faceImageUrl?: string,
	_rotation?: [number, number, number],
	_backImageUrl?: string
) {
	cards.update((state) => {
		const rotation = _rotation ?? state[id]?.rotation ?? [0, 0, 0];
		const faceImageUrl = _faceImageUrl ?? state[id]?.faceImageUrl ?? '';
		const backImageUrl = _backImageUrl ?? state[id]?.backImageUrl ?? '';
		return {
			...state,
			[id]: { position, rotation, faceImageUrl, backImageUrl }
		};
	});
}

function updateCardRotation(id: string, quaternion: THREE.Quaternion) {
	cards.update((state) => {
		const card = state[id];
		return {
			...state,
			[id]: {
				...card,
				rotation: [quaternion.x, quaternion.y, quaternion.z]
			}
		};
	});
}

function removeCard(id: string) {
	cards.update((state) => {
		const { [id]: _, ...rest } = state;
		return rest;
	});
}

function getCardState(id: string): CardState | undefined {
	return get(cards)[id];
}

export const objectStore = {
	updateCardState,
	updateCardRotation,
	removeCard,
	getCardState,
	...cards
};
