import {
	connect,
	joinLobby,
	onMessage,
	sendMessage,
	type WebSocketMessage,
	type ConnectedPlayer
} from './connection';
import { playerStore } from '$lib/store/playerStore.svelte';
import { deckStore } from '$lib/store/deckStore.svelte';
import type { CardState } from '$lib/store/objectStore.svelte';
import {
	convertVec3RecordToArray,
	purgeUndefinedValues
} from '$lib/utils/transforms/data';

/**
 * Initialize websocket connection and join the default lobby
 * @returns Promise that resolves when connected and joined
 */
export async function initWebsocket(): Promise<boolean> {
	// Check if player exists, if not create a player
	const player = playerStore.getMe();
	if (!player) {
		console.log('No player found, creating a new player');
		playerStore.addPlayer(undefined, true);
	}

	try {
		// Connect to the default lobby
		const connected = await connect('default');
		if (!connected) {
			console.error('Failed to connect to websocket server');
			return false;
		}

		// Join the default lobby
		const joined = await joinLobby('default');
		if (!joined) {
			console.error('Failed to join default lobby');
			return false;
		}

		console.log('Successfully connected and joined default lobby');

		// Set up event listeners for incoming messages
		setupMessageHandlers();

		return true;
	} catch (error) {
		console.error('Error initializing websocket:', error);
		return false;
	}
}

/**
 * Set up handlers for different message types
 */
function setupMessageHandlers(): void {
	onMessage((message: WebSocketMessage) => {
		switch (message.type) {
			case 'connect':
				console.log(`Player ${message.playerId} connected`);
				break;

			case 'disconnect':
				console.log(`Player ${message.playerId} disconnected`);
				// We keep the player in the store to preserve their data
				// but could mark them as offline if needed
				break;

			case 'playerList':
				console.log('Received player list:', message.players);
				if (message.players && message.players.length > 0) {
					// Update all players in the store
					message.players.forEach((player: ConnectedPlayer) => {
						playerStore.updatePlayer(player.id, {
							id: player.id,
							joinTimestamp: player.joinTimestamp
						});
					});
				}
				break;

			case 'sync':
				console.log('Received sync message, updating local state', message);
				console.log('xxxxx sync state', message);
				Object.entries(message?.state?.players ?? []).forEach(([id, state]) => {
					// @ts-expect-error: server sends var connected
					const { connected, ...playerState } = state ?? {};
					playerStore.updatePlayer(id, playerState);
				});

				Object.entries(message?.state?.decks ?? []).forEach(([id, state]) => {
					// @ts-expect-error: server sends var connected
					const { connected, ...deckState } = state ?? {};
					const cardRecords: Record<string, CardState> =
						(deckState?.cards as Record<string, any>) ?? {};
					const cards: (CardState & { id: string })[] = [];

					Object.entries(cardRecords).forEach(([key, value]) => {
						cards.push({
							...value,
							id: key
						});
					});

					//TODO: update state returned from websocket to reflect that it uses records
					//
					//@ts-expect-error: ws state uses records
					const position = convertVec3RecordToArray(deckState?.position);
					//@ts-expect-error: ws state uses records
					const rotation = convertVec3RecordToArray(deckState?.rotation);
					const payload = { ...deckState, cards, position, rotation };

					deckStore.silentUpdateDeck(id, purgeUndefinedValues(payload));
				});

				// Will handle sync logic later
				break;

			case 'update':
				console.log('Received update message', message);

				if (message.path?.includes('decks')) {
					const deckId = message.path[1];
					const position = message?.value?.position
						? Object.values(message?.value?.position)
						: undefined;
					const rotation = message?.value?.rotation
						? Object.values(message?.value?.rotation)
						: undefined;
					const cards = message?.value?.cards
						? Object.values(message?.value?.cards)
						: undefined;
					const payload = {
						...message.value,
						cards,
						position,
						rotation: message?.value?.rotation ? rotation : undefined
					};

					console.log('repacked, and updating deck with:', { payload });
					// NOTE: ATTEMPTING TO UPDATE CLIENT WITHOUT BROADCASTING AGAIN
					// BUG: works in real time but removes position and rotation from gamestate
					deckStore.silentUpdateDeck(deckId, payload);
				}

				break;

			case 'error':
				console.error('Received error message:', message.value);
				break;

			default:
				console.warn(`Unknown message type: ${message.type}`);
		}
	});
}

// Export the required functions
export { connect, joinLobby, sendMessage, onMessage };

// Also re-export the WebSocketMessage type
export type { WebSocketMessage };
