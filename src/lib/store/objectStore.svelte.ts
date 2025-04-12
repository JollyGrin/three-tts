/**
 * Track cards on the table via their 3d state (loc/rot) and images (face/back)
 *
 * Might rename this to cardStore and do 3d objects differently
 * */

import * as THREE from 'three';
import { writable, get } from 'svelte/store';
import { purgeUndefinedValues } from '$lib/utils/transforms/data';
import { merge } from './merge.svelte';

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
	console.log('LOCAL UPDATE', arg1, arg2);
	if (typeof arg1 === 'string' && arg2 === null) {
		return cards.update((state) => {
			const { [arg1]: _, ...rest } = state;
			console.log('REMOVING:', _);
			return rest;
		});
	}

	if (typeof arg1 === 'string')
		return updateCard({
			[arg1]: {
				...arg2
			}
		});

	// payload is recast to the first arg
	const payload = arg1;
	console.log('2 PAYLOAD:', payload, Object.values(payload));
	if (
		Object.values(payload).every(
			(value) => value === undefined || value === null
		)
	) {
		// on silent update, receives a payload of {cardId: null}
		const cardId = Object.keys(payload)[0];
		return cards.update((state) => {
			const { [cardId]: _, ...rest } = state;
			console.log('REMOVING:', _);
			return rest;
		});
	}

	// finally, if a normal card update:
	cards.update((state) => {
		return merge(state, payload) as Record<string, CardState>;
	});

	// if (updatedState === null) {
	// 	cards.update((state) => {
	// 		const { [id]: _, ...rest } = state;
	// 		return rest;
	// 	});
	// 	return;
	// }
	// cards.update((state) => {
	// 	const selectedCard = state[id];
	// 	return {
	// 		...state,
	// 		[id]: { ...selectedCard, ...purgeUndefinedValues(updatedState) }
	// 	};
	// });
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
