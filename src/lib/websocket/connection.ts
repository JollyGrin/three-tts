import { playerStore } from '$lib/store/playerStore.svelte';
import type { DeckDTO } from '$lib/store/deckStore.svelte';
import type { PlayerDTO } from '$lib/store/playerStore.svelte';
import type { CardState as CardDTO } from '$lib/store/objectStore.svelte';

export type ConnectedPlayer = {
	id: string;
	joinTimestamp: number;
};

export type WebSocketMessage = {
	type: 'connect' | 'sync' | 'update' | 'error' | 'disconnect' | 'playerList';
	path?: string[];
	value?: any;
	playerId: string;
	timestamp: number;
	players?: ConnectedPlayer[];
};

// Config
const WS_SERVER_URL = 'ws://localhost:8080/ws';
const DEFAULT_LOBBY = 'default';

// State
let socket: WebSocket | null = null;
let isConnected = false;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000; // 2 seconds

// Event callbacks
type MessageCallback = (message: WebSocketMessage) => void;
const messageCallbacks: MessageCallback[] = [];

/**
 * Connect to the websocket server
 * @param lobbyId The lobby ID to connect to (defaults to 'default')
 * @returns Promise that resolves when connected
 */
export async function connect(
	lobbyId: string = DEFAULT_LOBBY
): Promise<boolean> {
	if (isConnected) {
		console.log('Already connected to websocket server');
		return true;
	}

	if (isConnecting) {
		console.log('Already attempting to connect to websocket server');
		return false;
	}

	isConnecting = true;
	const player = playerStore.getMe();

	if (!player) {
		console.error('No player found in store');
		isConnecting = false;
		return false;
	}

	const playerId = player.id;
	const wsUrl = `${WS_SERVER_URL}?lobby=${lobbyId}&player=${playerId}`;

	console.log(`Connecting to websocket server at ${wsUrl}`);

	return new Promise((resolve) => {
		try {
			socket = new WebSocket(wsUrl);

			socket.onopen = () => {
				console.log('Connected to websocket server');
				isConnected = true;
				isConnecting = false;
				reconnectAttempts = 0;
				resolve(true);
			};

			socket.onclose = (event) => {
				console.log(
					`Websocket connection closed: ${event.code} ${event.reason}`
				);
				isConnected = false;
				isConnecting = false;

				// Attempt to reconnect
				if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
					reconnectAttempts++;
					setTimeout(() => {
						console.log(
							`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
						);
						connect(lobbyId);
					}, RECONNECT_DELAY);
				}

				if (!event.wasClean) {
					console.error('Connection closed abnormally');
				}

				resolve(false);
			};

			socket.onerror = (error) => {
				console.error('Websocket error:', error);
				isConnecting = false;
				resolve(false);
			};

			socket.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data) as WebSocketMessage;
					handleMessage(message);
				} catch (error) {
					console.error('Error parsing message:', error);
				}
			};
		} catch (error) {
			console.error('Error connecting to websocket server:', error);
			isConnecting = false;
			resolve(false);
		}
	});
}

/**
 * Join a lobby as the current player
 * @param lobbyId Lobby ID to join (defaults to 'default')
 * @returns Promise that resolves when joined
 */
export async function joinLobby(
	lobbyId: string = DEFAULT_LOBBY
): Promise<boolean> {
	// First ensure we're connected
	if (!isConnected) {
		const connected = await connect(lobbyId);
		if (!connected) return false;
	}

	const player = playerStore.getMe();
	if (!player) {
		console.error('No player found in store');
		return false;
	}

	// Send join message
	const joinMessage: WebSocketMessage = {
		type: 'connect',
		playerId: player.id,
		timestamp: Date.now()
	};

	return sendMessage(joinMessage);
}

/**
 * Send a message to the websocket server
 * @param message Message to send
 * @returns True if sent successfully
 */
export function sendMessage(message: WebSocketMessage): boolean {
	if (!socket || !isConnected) {
		console.error('Cannot send message: not connected to websocket server');
		return false;
	}

	try {
		socket.send(JSON.stringify(message));
		return true;
	} catch (error) {
		console.error('Error sending message:', error);
		return false;
	}
}

/**
 * Register a callback to be called when a message is received
 * @param callback Function to call with the received message
 */
export function onMessage(callback: MessageCallback): void {
	messageCallbacks.push(callback);
}

/**
 * Handle incoming messages
 * @param message Message received from the server
 */
function handleMessage(message: WebSocketMessage): void {
	// Log the message
	console.log('Received message:', message);

	// Call all registered callbacks
	messageCallbacks.forEach((callback) => {
		try {
			callback(message);
		} catch (error) {
			console.error('Error in message callback:', error);
		}
	});
}

/**
 * Disconnect from the websocket server
 */
export function disconnect(): void {
	if (socket) {
		socket.close();
		socket = null;
	}
	isConnected = false;
	isConnecting = false;
}

/**
 * Check if connected to the websocket server
 * @returns True if connected
 */
export function isWebSocketConnected(): boolean {
	return isConnected;
}
