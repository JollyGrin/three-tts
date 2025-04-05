import { get, writable } from 'svelte/store';
import { nanoid } from 'nanoid';
import type { CardState } from './objectStore.svelte';
import { trayStore } from './trayStore.svelte';
import { seatStore } from './seatStore.svelte';

type PlayerDTO = {
	id: string;
	joinTimestamp: number;
	trayCards: Record<string, CardState>;
	seat: 0 | 1 | 2 | 3;
	/**
	 * The ids of the decks owned by player
	 * reference in deckStore
	 * */
	deckIds: string[];
	/**
	 * extend for future use with life/resources
	 * */
	metadata: any;
};

type PlayersState = Record<string, PlayerDTO>;

const players = writable<PlayersState>({});
const myPlayerId = writable<string>(undefined);

const handleLocalStorage = {
	get: () => {
		return localStorage.getItem('myPlayerId');
	},
	update: (id: string) => {
		localStorage.setItem('myPlayerId', id);
	}
};

function addPlayer(_id?: string, isMe: boolean = false) {
	const cacheId = handleLocalStorage.get();
	const id = _id ?? cacheId ?? nanoid(6);
	if (!cacheId) handleLocalStorage.update(id);
	if (isMe) myPlayerId.set(id);
	players.update((state) => {
		return {
			...state,
			[id]: {
				id,
				seat: 0,
				joinTimestamp: Date.now(),
				trayCards: {},
				deckIds: [],
				metadata: {}
			}
		};
	});
	myPlayerId.set(id);
}

/**
 * Returns the players in order of joinTimestamp
 * if playerId is provided, also returns playerOrderIndex
 * */
function getPlayersJoinOrder(playerId?: string) {
	const orderedPlayers = get(players)
		? Object.values(get(players)).sort(
				(a, b) => a.joinTimestamp - b.joinTimestamp
			)
		: [];

	let playerOrderIndex = null;
	const joinOrder = orderedPlayers.map((player, index) => {
		if (player.id === playerId) playerOrderIndex = index;
		return { id: player.id, joinTimestamp: player.joinTimestamp, order: index };
	});

	return {
		joinOrder,
		playerOrderIndex,
		amountOfPlayers: orderedPlayers.length
	};
}

/**
 * Add ownership of a deck to a specific player
 * TODO: currently not used, but can be used later to permission deck actions
 * */
function addDeckToPlayer(playerId: string, deckId: string) {
	players.update((state) => {
		return {
			...state,
			[playerId]: {
				...state[playerId],
				deckIds: [...state[playerId].deckIds, deckId]
			}
		};
	});
}

function getMe() {
	const myId = get(myPlayerId);
	return get(players)[myId];
}

// SUBSCRIBE TO CHANGES
// Use local stores to update state but then sync them with playerstore
const unsubTrayStore = trayStore.subscribe((state) => {
	const myId = get(myPlayerId);
	if (!myId) return;
	players.update((players) => ({
		...players,
		[myId]: {
			...players[myId],
			trayCards: state
		}
	}));
});

const unsubSeatStore = seatStore.subscribe((state) => {
	const myId = get(myPlayerId);
	if (!myId) return;
	players.update((players) => ({
		...players,
		[myId]: {
			...players[myId],
			seat: state.seat
		}
	}));
});

export type { PlayerDTO };
export const playerStore = {
	...players,
	getMe,
	addPlayer,
	getPlayersJoinOrder,
	addDeckToPlayer,

	unsub: {
		unsubTrayStore,
		unsubSeatStore
	}
};
