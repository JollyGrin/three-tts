import {
	connect,
	joinLobby,
	onMessage,
	sendMessage,
	type WebSocketMessage,
	type ConnectedPlayer
} from './connection';
import { gameActions } from '$lib/store/game/actions';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import toast from 'svelte-french-toast';

/**
 * Initialize websocket connection and join the default lobby
 * @returns Promise that resolves when connected and joined
 */
export async function initWebsocket(
	_lobbyId?: string,
	serverUrl?: string
): Promise<boolean> {
	const lobbyId = _lobbyId ?? 'default';
	// Check if player exists, if not create a player
	const player = gameActions.getMe();
	if (!player) {
		console.log('No player found, creating a new player');
		gameActions.addPlayer();
	}

	try {
		// Connect to the default lobby
		const connected = await connect(lobbyId, serverUrl);
		if (!connected) {
			console.error('Failed to connect to websocket server');
			return false;
		}

		// Join the default lobby
		const joined = await joinLobby(lobbyId);
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
				toast(`Player ${message.playerId} connected`);
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
						gameStore?.updateStateSilently({
							players: {
								[player.id]: {
									id: player.id,
									joinTimestamp: player.joinTimestamp
								}
							}
						});
					});
				}
				break;

			case 'sync':
				console.log('Received sync message, updating local state', message);
				gameStore.updateStateSilently(message.value);

				break;

			case 'update':
				console.log('Received update message', message);
				gameStore.updateStateSilently(message.value);

				break;

			case 'error':
				console.error('Received error message:', message.value);
				toast('Connection Error:', message.value);
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
