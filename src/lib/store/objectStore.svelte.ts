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

function updateCard(id: string, updatedState: Partial<CardState> | null) {
	if (updatedState === null) {
		cards.update((state) => {
			const { [id]: _, ...rest } = state;
			return rest;
		});
		return;
	}
	cards.update((state) => {
		const selectedCard = state[id];
		return {
			...state,
			[id]: { ...selectedCard, ...purgeUndefinedValues(updatedState) }
		};
	});
}

function removeCard(id: string) {
	return objectStore.updateCard(id, null);
	// cards.update((state) => {
	// 	const { [id]: _, ...rest } = state;
	// 	return rest;
	// });
}

function getCardState(id: string): CardState | undefined {
	return get(cards)[id];
}

export const objectStore = {
	updateCard,
	// NOTE: silent updated in storeIntegration.ts
	silentUpdateCard: (..._args: Parameters<typeof updateCard>) =>
		console.warn('updateCard not initialized'),
	removeCard,
	getCardState,
	...cards
};
