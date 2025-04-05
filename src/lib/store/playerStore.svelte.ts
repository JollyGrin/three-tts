import { get, writable } from 'svelte/store';
import { nanoid } from 'nanoid';
import type { CardState } from './objectStore.svelte';
import { trayStore } from './trayStore.svelte';

type PlayerDTO = {
	id: string;
	joinTimestamp: number;
	trayCards: Record<string, CardState>;
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

function addPlayer(_id?: string, isMe: boolean = false) {
	const id = _id ?? nanoid(6);
	if (isMe) myPlayerId.set(id);
	players.update((state) => {
		return {
			...state,
			[id]: {
				id,
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

const unsubTrayStore = trayStore.subscribe((state) => {
	const myId = get(myPlayerId);
	if (!myId) return;
	players.update((players) => {
		return {
			...players,
			[myId]: {
				...players[myId],
				trayCards: state
			}
		};
	});
});

function getMe() {
	return get(myPlayerId);
}

export const playerStore = {
	...players,
	getMe,
	addPlayer,
	getPlayersJoinOrder,
	addDeckToPlayer,

	unsub: {
		unsubTrayStore
	}
};
