/**
 * Track cards on the table via their 3d state (loc/rot) and images (face/back)
 *
 * Might rename this to cardStore and do 3d objects differently
 * */

import { writable, get } from 'svelte/store';
import { localStateUpdater, transformPayload } from './transform-helpers';

export interface CardState {
	position: [number, number, number];
	rotation: [number, number, number];
	faceImageUrl: string;
	backImageUrl?: string;
}

type CardsState = Record<string, CardState>;

const cards = writable<CardsState>({});

// HACK: old method was to send id and payload, but the new method sends just a payload to update the main state
// thus, old functions send id, this should take that and the payload, to form the new payload
function updateCard(
	arg1: string | Partial<CardState>,
	arg2?: Partial<CardState> | null
) {
	const payload = transformPayload(arg1, arg2);
	return localStateUpdater(payload, cards.update);
}

function removeCard(id: string) {
	return objectStore.updateCard(id, null);
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
