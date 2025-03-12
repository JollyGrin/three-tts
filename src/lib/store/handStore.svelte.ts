import { writable } from 'svelte/store';

export interface HandCard {
	id: string;
	faceImageUrl: string;
	// Any other properties needed for hand cards
}

export const handStore = writable<HandCard[]>([]);
