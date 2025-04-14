import { nanoid } from 'nanoid';
import { gameStore } from '../gameStore.svelte';
import { get } from 'svelte/store';
import type { GameDTO } from '../types';

/**
 * Fetch and set playerId to localStorage
 * */
const handleLocalStorage = {
	get: () => {
		return localStorage.getItem('myPlayerId');
	},
	update: (id: string) => {
		localStorage.setItem('myPlayerId', id);
	}
};

function addPlayer(_id?: string) {
	const cacheId = handleLocalStorage.get();
	const id = _id ?? cacheId ?? nanoid(6);
	if (!cacheId) handleLocalStorage.update(id);
	gameStore.updateState({
		players: {
			[id]: {
				id,
				seat: 0,
				joinTimestamp: Date.now(),
				tray: {},
				deckIds: [],
				metadata: {}
			}
		}
	});
}

function getPlayer(playerId: string) {
	return get(gameStore).players?.[playerId];
}
function getMe() {
	const cacheId = handleLocalStorage.get();
	if (!cacheId) return console.error('No player id found in localstorage');
	return get(gameStore)?.players?.[cacheId];
}

function setSeat(seat?: GameDTO['players'][string]['seat']) {
	const myPlayerId = getMe()?.id;
	if (!myPlayerId) return console.error('No player id found in localstorage');

	const mySeat = get(gameStore)?.players?.[myPlayerId]?.seat ?? 0;
	if (seat === undefined)
		return gameStore.updateState({
			players: {
				[myPlayerId]: {
					seat: ((mySeat + 1) % 4) as GameDTO['players'][string]['seat']
				}
			}
		});

	return gameStore?.updateState({ players: { [myPlayerId]: { seat } } });
}

export const playerActions = {
	addPlayer,
	getPlayer,
	getMe,
	setSeat
};
