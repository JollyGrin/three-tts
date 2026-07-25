import { connect, joinLobby, onMessage, sendMessage, type WebSocketMessage } from './connection';
import { gameActions } from '$lib/store/game/actions';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { prewarmGameState } from '$lib/packs/prewarm-state';
import toast from 'svelte-french-toast';

/**
 * Initialize websocket connection and join the given lobby
 * @param lobbyId Lobby to join — callers roll one with randomLobbyName() when
 * the URL has no ?lobby, so there is no shared fallback room
 * @returns Promise that resolves when connected and joined
 */
export async function initWebsocket(lobbyId: string, serverUrl?: string): Promise<boolean> {
	// Check if player exists, if not create a player
	const player = gameActions.getMe();
	if (!player) {
		console.log('No player found, creating a new player');
		gameActions.addPlayer();
	}

	try {
		// Connect to the lobby
		const connected = await connect(lobbyId, serverUrl);
		if (!connected) {
			console.error('Failed to connect to websocket server');
			return false;
		}

		// Join the lobby
		const joined = await joinLobby(lobbyId);
		if (!joined) {
			console.error(`Failed to join lobby ${lobbyId}`);
			return false;
		}

		console.log(`Successfully connected and joined lobby ${lobbyId}`);

		// Set up event listeners for incoming messages
		setupMessageHandlers();

		// Re-publish my player row now that the socket is open. addPlayer()
		// above ran before connect(), so its patch was dropped (sendMessage has
		// no queue) — without this, peers only ever receive seat/tray/connected
		// patches for this player, and the HUD's ghost-row guard (rows without
		// a joinTimestamp are not players yet) would hide the row forever.
		// Only id + joinTimestamp: re-sending the fresh local row's seat would
		// clobber the seat a reconnecting player already holds in lobby state.
		publishMyPlayerRow();

		return true;
	} catch (error) {
		console.error('Error initializing websocket:', error);
		return false;
	}
}

/**
 * Broadcast the minimal row that marks the local player as a real player in
 * the lobby state. Goes through gameStore.updateState, which storeIntegration
 * wraps to send over the (now open) websocket.
 */
function publishMyPlayerRow(): void {
	const me = gameActions.getMe();
	if (!me?.id) return;
	gameStore.updateState({
		players: { [me.id]: { id: me.id, joinTimestamp: me.joinTimestamp ?? Date.now() } }
	});
}

/**
 * Set up handlers for different message types
 */
function setupMessageHandlers(): void {
	onMessage((message: WebSocketMessage) => {
		switch (message.type) {
			case 'sync':
				console.log('Received sync message, updating local state', message);
				gameStore.updateStateSilently(message.value);
				// resolve all sheet refs in the synced state, then force one
				// re-render sweep so everything repaints deterministically
				prewarmGameState(message.value, ({ total, failed }) => {
					gameStore.updateStateSilently({});
					toast(
						failed > 0
							? `Card art: ${total - failed}/${total} loaded`
							: `Card art ready (${total})`,
						{ duration: 3000 }
					);
				});
				break;

			case 'update':
				console.log('Received update message', message);
				gameStore.updateStateSilently(message.value);
				prewarmGameState(message.value, () => gameStore.updateStateSilently({}));
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
