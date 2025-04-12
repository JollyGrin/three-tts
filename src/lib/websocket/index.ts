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
import { objectStore, type CardState } from '$lib/store/objectStore.svelte';
import { purgeUndefinedValues } from '$lib/utils/transforms/data';

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

				if ('objects' in message.value) {
					objectStore.silentUpdateCard(message.value.objects);
				}

				break;

			case 'update':
				console.log('Received update message', message);

				if ('objects' in message.value) {
					console.log('updating objects', message.value.objects);
					objectStore.silentUpdateCard(message.value.objects);
				}

				if ('decks' in message.value) {
					console.log('updating decks', message.value.decks);
					deckStore.silentUpdateDeck(message.value.decks);
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
