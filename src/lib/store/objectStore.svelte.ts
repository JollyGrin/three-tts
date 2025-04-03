/**
 * Track cards on the table via their 3d state (loc/rot) and images (face/back)
 *
 * Might rename this to cardStore and do 3d objects differently
 * */

import * as THREE from 'three';
import { writable, get } from 'svelte/store';
import { playerId } from '../websocket';

export interface CardState {
	position: [number, number, number];
	rotation: [number, number, number];
	faceImageUrl: string;
	backImageUrl?: string;
	lastTouchedBy?: string; // Player ID of the last player to touch this card
	lastTouchTime?: number; // Timestamp of the last touch
}

type CardsState = Record<string, CardState>;

const cards = writable<CardsState>({});

// Throttle time in ms - limit updates to prevent feedback loops
const THROTTLE_TIME = 50;
// Ownership timeout - how long a player "owns" a card after touching it
const OWNERSHIP_TIMEOUT = 2000;

function updateCardState(
	id: string,
	position: [number, number, number],
	_faceImageUrl?: string,
	_rotation?: [number, number, number],
	_backImageUrl?: string,
	_fromSync: boolean = false // true if update comes from sync, bypass ownership check
) {
	const currentPlayerId = get(playerId);

	cards.update((state) => {
		const currentCard = state[id];
		const rotation = _rotation ?? currentCard?.rotation ?? [0, 0, 0];
		const faceImageUrl = _faceImageUrl ?? currentCard?.faceImageUrl ?? '';
		const backImageUrl = _backImageUrl ?? currentCard?.backImageUrl ?? '';
		
		// Current time for touch checks
		const now = Date.now();
		
		// Check if another player recently touched this card and still "owns" it
		const lastTouchedBy = currentCard?.lastTouchedBy;
		const lastTouchTime = currentCard?.lastTouchTime || 0;
		
		// If this is not from sync and another player touched this card recently, 
		// don't allow local updates (avoids feedback loops in realtime dragging)
		if (!_fromSync && 
			lastTouchedBy && 
			lastTouchedBy !== currentPlayerId && 
			(now - lastTouchTime) < OWNERSHIP_TIMEOUT) {
			console.log(`Card ${id} is being moved by ${lastTouchedBy}, ignoring local update`);
			return state; // Don't update
		}
		
		// If this card was last updated very recently, throttle updates to prevent storms
		if (!_fromSync && 
			currentCard && 
			(now - (currentCard.lastTouchTime || 0)) < THROTTLE_TIME) {
			console.log(`Throttling update for card ${id}`);
			return state; // Don't update too frequently
		}
		
		// Update the card state with new ownership information
		return {
			...state,
			[id]: { 
				position, 
				rotation, 
				faceImageUrl, 
				backImageUrl,
				lastTouchedBy: _fromSync ? lastTouchedBy : currentPlayerId,
				lastTouchTime: _fromSync ? lastTouchTime : now
			}
		};
	});
}

function updateCardRotation(id: string, quaternion: THREE.Quaternion) {
	cards.update((state) => {
		const card = state[id];
		if (!card) return state;
		
		// Check ownership same as in updateCardState
		const currentPlayerId = get(playerId);
		const now = Date.now();
		
		if (card.lastTouchedBy && 
			card.lastTouchedBy !== currentPlayerId && 
			(now - (card.lastTouchTime || 0)) < OWNERSHIP_TIMEOUT) {
			console.log(`Card ${id} rotation is locked by ${card.lastTouchedBy}, ignoring update`);
			return state;
		}
		
		// Throttle frequent updates
		if (card && (now - (card.lastTouchTime || 0)) < THROTTLE_TIME) {
			return state;
		}
		
		return {
			...state,
			[id]: {
				...card,
				rotation: [quaternion.x, quaternion.y, quaternion.z],
				lastTouchedBy: currentPlayerId,
				lastTouchTime: now
			}
		};
	});
}

function removeCard(id: string) {
	cards.update((state) => {
		const newState = { ...state };
		delete newState[id];
		return newState;
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
	subscribe: cards.subscribe
};
