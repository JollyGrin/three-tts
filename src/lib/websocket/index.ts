import {
	connect,
	joinLobby,
	onMessage,
	sendMessage,
	type WebSocketMessage
} from './connection';
import { playerStore } from '$lib/store/playerStore.svelte';

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
				console.log(`Player ${message.playerId} connected`, message);

				break;

			case 'sync':
				console.log('Received sync message, updating local state');
				// Will handle sync logic later
				break;

			case 'update':
				console.log('Received update message', message);
				// Will handle update logic later
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
