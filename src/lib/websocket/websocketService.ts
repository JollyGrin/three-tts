/**
 * Websocket Service
 * Handles connection to the websocket server and message processing
 */
import { writable, get } from 'svelte/store';
import { nanoid } from 'nanoid';
import { browser } from '$app/environment';

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

// Store of sent message IDs to prevent feedback loops
const sentMessageIds = new Set<string>();

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

// Message processor function - will be set by the messageProcessor module
let processMessage: ((message: any) => void) | null = null;

/**
 * Set the message processor function
 * This breaks the circular dependency between modules
 */
export function setMessageProcessor(processor: (message: any) => void): void {
  processMessage = processor;
}

/**
 * Connect to websocket server
 */
export async function connect(wsUrl: string, lobbyIdentifier: string, secret?: string): Promise<void> {
  if (!browser) return; // Only connect in browser environment

  return new Promise((resolve, reject) => {
    try {
      // Update lobby ID
      lobbyId.set(lobbyIdentifier);
      
      // If already connected or connecting, disconnect first
      if (socket) {
        disconnect();
      }

      // Update connection status
      connectionStatus.set(ConnectionState.CONNECTING);
      connectionError.set(null);
      
      // Create websocket connection
      console.log(`[WS] Connecting to ${wsUrl}`);
      socket = new WebSocket(wsUrl);
      
      // Set up event handlers
      socket.onopen = () => {
        handleOpen();
        resolve();
      };
      socket.onmessage = handleMessage;
      socket.onclose = handleClose;
      socket.onerror = (err) => {
        handleError(err);
        reject(err);
      };
    } catch (error) {
      handleConnectionError(error);
      reject(error);
    }
  });
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
  console.log('[WS] Connection established');
  connectionStatus.set(ConnectionState.CONNECTED);
  connectionError.set(null);
  reconnectAttempts = 0;
  
  // Send connect message with player ID and lobby ID
  const connectMessage = {
    type: 'connect',
    playerId: get(playerId),
    timestamp: Date.now(),
    payload: {
      lobbyId: get(lobbyId),
      playerId: get(playerId)
    }
  };
  
  // Send the connect message
  const success = sendMessage(connectMessage);
  console.log(`[WS] Sent connect message: ${success ? 'success' : 'failed'}`);
}

/**
 * Handle websocket messages
 */
function handleMessage(event: MessageEvent): void {
  try {
    const message = JSON.parse(event.data);
    
    // Double check that we're not processing our own messages
    // 1. Check the message ID for ones we've sent
    // 2. Check if the player ID matches our own (additional fallback)
    const currentPlayerId = get(playerId);
    
    if (message.playerId === currentPlayerId || 
        (message.messageId && sentMessageIds.has(message.messageId))) {
      console.log(`[WS] Ignoring our own message - ID: ${message.messageId || 'none'}, Player: ${message.playerId}`);
      return;
    }
    
    // Handle different message types
    switch (message.type) {
      case 'playerList':
        // Update player list
        if (message.payload) {
          // Server sends player list directly in payload (not nested in 'players' property)
          // Use .update instead of .set to avoid unnecessary subscription triggers
          playerList.update(current => {
            const newPlayers = Array.isArray(message.payload) ? message.payload : [];
            // Only log if there's an actual change
            if (JSON.stringify(current) !== JSON.stringify(newPlayers)) {
              console.log(`[WS] Updated player list: ${newPlayers.length} players`, newPlayers);
            }
            return newPlayers;
          });
        }
        break;
        
      case 'update':
      case 'sync':
        // Process state update with message processor
        if (processMessage) {
          console.log(`[WS] Received ${message.type} message:`, 
            message.path ? { path: message.path.join('.') } : '(sync)');
          processMessage(message);
        } else {
          console.warn('[WS] Received message but processMessage is not set');
        }
        break;
        
      case 'error':
        // Handle error message
        console.error('[WS] Server error:', message.payload?.message);
        break;
        
      default:
        console.log(`[WS] Received message of type: ${message.type}`);
    }
  } catch (error) {
    console.error('[WS] Error processing message:', error, event.data);
  }
}

/**
 * Handle websocket close event
 */
function handleClose(event: CloseEvent): void {
  if (socket) {
    socket = null;
  }
  
  connectionStatus.set(ConnectionState.DISCONNECTED);
  
  // Only attempt to reconnect if it wasn't a clean closure
  if (!event.wasClean && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    
    // Exponential backoff for reconnect
    const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
    
    // Get the websocket URL for reconnection
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}`;
    
    console.log(`[WS] Scheduling reconnect attempt ${reconnectAttempts} in ${delay}ms`);
    
    reconnectTimer = window.setTimeout(() => {
      // Call connect with both the URL and lobby ID
      connect(wsUrl, get(lobbyId));
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
    // Add a unique message ID to track our own messages
    const messageId = nanoid(12);
    const messageWithId = {
      ...message,
      messageId
    };
    
    // Store the ID to recognize our own messages
    sentMessageIds.add(messageId);
    
    // Clean up old message IDs after a delay to prevent memory leaks
    setTimeout(() => {
      sentMessageIds.delete(messageId);
    }, 10000); // 10 seconds
    
    socket.send(JSON.stringify(messageWithId));
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
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('[WS] Cannot send update, not connected');
    return false;
  }
  
  // Generate unique message ID
  const messageId = nanoid(12);
  
  // Create update message
  const message = {
    type: 'update',
    playerId: get(playerId),
    timestamp: Date.now(),
    messageId,
    path,
    value
  };
  
  console.log(`[WS] Sending update for path: ${path.join('.')}`);
  
  // Track the sent message ID BEFORE sending to prevent race conditions
  sentMessageIds.add(messageId);
  
  // Send message
  const success = sendMessage(message);
  
  // Clean up after delay to prevent memory leaks
  setTimeout(() => {
    sentMessageIds.delete(messageId);
  }, 10000); // Longer timeout to ensure we don't get duplicates
  
  return success;
}

// Export player ID for use in components
export { playerId };
