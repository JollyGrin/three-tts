/**
 * Track cards on the table via their 3d state (loc/rot) and images (face/back)
 *
 * Might rename this to cardStore and do 3d objects differently
 * */

import * as THREE from 'three';
import { writable, get } from 'svelte/store';
import { purgeUndefinedValues } from '$lib/utils/transforms/data';

export interface CardState {
	position: [number, number, number];
	rotation: [number, number, number];
	faceImageUrl: string;
	backImageUrl?: string;
}

type CardsState = Record<string, CardState>;

const cards = writable<CardsState>({});

function updateCard(id: string, updatedState: Partial<CardState>) {
	cards.update((state) => {
		const selectedCard = state[id];
		return {
			...state,
			[id]: { ...selectedCard, ...purgeUndefinedValues(updatedState) }
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
	updateCard,
	updateCardRotation,
	removeCard,
	getCardState,
	...cards
};
