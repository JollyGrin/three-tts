import { get, writable } from 'svelte/store';
import { nanoid } from 'nanoid';
import type { CardState } from './objectStore.svelte';
import { trayStore } from './trayStore.svelte';
import { seatStore } from './seatStore.svelte';
import { localStateUpdater, transformPayload } from './transform-helpers';

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

function updatePlayer(
	id: string | Partial<PlayerDTO>,
	updatedState?: Partial<PlayerDTO> | null
) {
	const payload = transformPayload(id, updatedState);
	return localStateUpdater(payload, players.update);
	//  return
	// players.update((state) => {
	// 	const selectedPlayer = state[id];
	// 	return {
	// 		...state,
	// 		[id]: { ...selectedPlayer, ...updatedState }
	// 	};
	// });
}

function addPlayer(_id?: string, isMe: boolean = false) {
	const cacheId = handleLocalStorage.get();
	const id = _id ?? cacheId ?? nanoid(6);
	if (!cacheId) handleLocalStorage.update(id);
	if (isMe) myPlayerId.set(id);
	playerStore.updatePlayer(id, {
		id,
		seat: 0,
		joinTimestamp: Date.now(),
		trayCards: {},
		deckIds: [],
		metadata: {}
	});
	return;

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

function updateMe(partialState: Partial<PlayerDTO>) {
	const myId = get(myPlayerId);
	if (!myId) return;
	playerStore.updatePlayer(myId, partialState);
}

function addDeckToPlayer(playerId: string, deckId: string) {
	playerStore.updatePlayer(playerId, {
		deckIds: [...get(players)[playerId].deckIds, deckId]
	});
}

function getPlayer(playerId: string) {
	return get(players)[playerId];
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
	playerStore.updatePlayer(myId, {
		trayCards: state
	});
	// players.update((players) => ({
	// 	...players,
	// 	[myId]: {
	// 		...players[myId],
	// 		trayCards: state
	// 	}
	// }));
});

const unsubSeatStore = seatStore.subscribe((state) => {
	const myId = get(myPlayerId);
	if (!myId) return;

	playerStore.updatePlayer(myId, {
		seat: state.seat
	});
});

export type { PlayerDTO };
export const playerStore = {
	...players,
	getPlayer,
	getMe,
	addPlayer,
	updatePlayer,
	// NOTE: silent updated in storeIntegration.ts
	silentUpdatePlayer: (..._args: Parameters<typeof updatePlayer>) =>
		console.warn('updatePlayer not initialized'),
	updateMe,
	addDeckToPlayer,

	unsub: {
		unsubTrayStore,
		unsubSeatStore
	}
};
