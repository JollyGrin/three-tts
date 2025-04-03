/**
 * Websocket Service
 * Handles connection to the websocket server and message processing
 */
import { writable, get } from 'svelte/store';
import { nanoid } from 'nanoid';
import { browser } from '$app/environment';
import { processWebsocketMessage } from './messageProcessor';

// Websocket connection states
export const enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected'
}

// Connection status store
export const connectionStatus = writable<ConnectionState>(ConnectionState.DISCONNECTED);
export const connectionError = writable<string | null>(null);

// Player and lobby information
const playerId = writable<string>(browser ? localStorage.getItem('playerId') || nanoid(8) : nanoid(8));
export const lobbyId = writable<string>('default'); // Default lobby ID
export const playerList = writable<string[]>([]);

// Save player ID to localStorage in browser environment
if (browser) {
  playerId.subscribe(id => {
    localStorage.setItem('playerId', id);
  });
}

// WebSocket instance
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 1000; // 1 second

/**
 * Connect to websocket server
 */
export function connect(lobby: string, secret?: string): void {
  if (!browser) return; // Only connect in browser environment

  // Update lobby ID
  lobbyId.set(lobby);
  
  // If already connected or connecting, disconnect first
  if (socket) {
    disconnect();
  }

  // Update connection status
  connectionStatus.set(ConnectionState.CONNECTING);
  connectionError.set(null);
  
  // Get the websocket URL - default to localhost during development
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
  const wsUrl = `${wsProtocol}//${wsHost}`;
  
  // Create websocket connection
  try {
    socket = new WebSocket(wsUrl);
    
    // Set up event handlers
    socket.onopen = handleOpen;
    socket.onmessage = handleMessage;
    socket.onclose = handleClose;
    socket.onerror = handleError;
  } catch (error) {
    handleConnectionError(error);
  }
}

/**
 * Disconnect from websocket server
 */
export function disconnect(): void {
  if (socket) {
    socket.close();
    socket = null;
  }
  
  // Clear reconnect timer if active
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  connectionStatus.set(ConnectionState.DISCONNECTED);
}

/**
 * Handle websocket open event
 */
function handleOpen(): void {
  connectionStatus.set(ConnectionState.CONNECTED);
  connectionError.set(null);
  reconnectAttempts = 0;
  
  // Send connect message with player ID and lobby ID
  sendMessage({
    type: 'connect',
    playerId: get(playerId),
    timestamp: Date.now(),
    payload: {
      lobbyId: get(lobbyId),
      playerId: get(playerId)
    }
  });
}

/**
 * Handle websocket messages
 */
function handleMessage(event: MessageEvent): void {
  try {
    const message = JSON.parse(event.data);
    
    // Update player list if it's a player list message
    if (message.type === 'playerList') {
      playerList.set(message.payload);
    } 
    // Process other messages
    else {
      processWebsocketMessage(message);
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

/**
 * Handle websocket close event
 */
function handleClose(event: CloseEvent): void {
  socket = null;
  connectionStatus.set(ConnectionState.DISCONNECTED);
  
  // Only attempt to reconnect if it wasn't a clean closure
  if (!event.wasClean && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    
    // Exponential backoff for reconnect
    const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
    
    reconnectTimer = window.setTimeout(() => {
      connect(get(lobbyId));
    }, delay);
  }
}

/**
 * Handle websocket error event
 */
function handleError(event: Event): void {
  handleConnectionError('Connection error');
}

/**
 * Handle connection errors
 */
function handleConnectionError(error: any): void {
  connectionStatus.set(ConnectionState.DISCONNECTED);
  connectionError.set(error?.message || String(error) || 'Unknown connection error');
  socket = null;
}

/**
 * Send message to websocket server
 */
export function sendMessage(message: any): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
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
 * Send state update to websocket server
 */
export function sendUpdate(path: string[], value: any): boolean {
  return sendMessage({
    type: 'update',
    playerId: get(playerId),
    timestamp: Date.now(),
    path,
    value
  });
}

// Export player ID for use in components
export { playerId };
