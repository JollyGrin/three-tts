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
				metadata: {}
			}
		}
	});
}

function getPlayer(playerId: string) {
	return get(gameStore).players?.[playerId];
}
/**
 * Both of these return undefined on a first-ever visit, which is an ordinary
 * state and not a fault: every caller between page load and `addPlayer()` —
 * TableCamera, HUDPieces, initWebsocket itself — asks before there is an id and
 * handles the miss. They used to log an error each time, which put ~8 red lines
 * in a healthy console and made "the console is clean" untestable (#102). The
 * callers that genuinely cannot proceed without an id still say so themselves.
 */
function getMe() {
	const cacheId = handleLocalStorage.get();
	if (!cacheId) return undefined;
	return get(gameStore)?.players?.[cacheId];
}
function getMyId() {
	const cacheId = handleLocalStorage.get();
	if (!cacheId) return undefined;
	return cacheId;
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

function getMySeat() {
	const myPlayerId = getMe()?.id;
	if (!myPlayerId) return 0;
	const mySeat = get(gameStore)?.players?.[myPlayerId]?.seat ?? 0;
	return mySeat;
}

export const playerActions = {
	addPlayer,
	getPlayer,
	getMe,
	getMyId,
	setSeat,
	getMySeat
};
