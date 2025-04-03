/**
 * Message Processor
 * Processes incoming websocket messages and updates stores accordingly
 */
import { get } from 'svelte/store';
import { objectStore } from '../store/objectStore.svelte';
import { trayStore } from '../store/trayStore.svelte';
import { deckStore } from '../store/deckStore.svelte';
import { seatStore, setSeat } from '../store/seatStore.svelte';
import { playerId, setMessageProcessor } from './websocketService';

// Track processed messages to prevent applying duplicate updates
const processedMessages = new Set<string>();

// Debug logging for client side
const DEBUG_MODE = true;

function logDebug(message: string, data?: any): void {
  if (DEBUG_MODE) {
    console.log(`[WS] ${message}`, data || '');
  }
}

/**
 * Process incoming websocket message and update appropriate stores
 */
export function processWebsocketMessage(message: any): void {
  // Always ignore messages from self
  if (message.playerId === get(playerId)) {
    logDebug(`Ignoring message from self: ${message.messageId || 'unknown'}`);
    return;
  }
  
  logDebug(`Processing message from ${message.playerId}, type: ${message.type}`, 
    message.path ? { path: message.path } : null);
  
  // Check for duplicate messages (additional safeguard)
  if (message.messageId) {
    if (processedMessages.has(message.messageId)) {
      logDebug(`Already processed message: ${message.messageId}`);
      return; // Already processed this message
    }
    
    // Mark as processed
    processedMessages.add(message.messageId);
    
    // Clean up after a delay to prevent memory leaks
    setTimeout(() => {
      processedMessages.delete(message.messageId);
    }, 5000);
  }
  
  // Process based on message type
  switch (message.type) {
    case 'sync':
      // Full state sync
      processSyncMessage(message);
      break;
      
    case 'update':
      // State update
      processUpdateMessage(message);
      break;
      
    case 'error':
      // Error message
      console.error('Server error:', message.payload?.message);
      break;
      
    default:
      console.warn('Unknown message type:', message.type);
  }
}

/**
 * Process full state sync message
 */
function processSyncMessage(message: any): void {
  const state = message.payload;
  
  if (!state) return;
  
  logDebug(`Processing sync message with ${Object.keys(state.boardState || {}).length} board objects`);
  
  // Process board state (objects on the table)
  if (state.boardState) {
    // Clear existing objects and add new ones
    // (more efficient to replace all than iterate through differences)
    Object.entries(state.boardState).forEach(([id, objectState]: [string, any]) => {
      objectStore.updateCardState(
        id,
        objectState.position,
        objectState.faceImageUrl,
        objectState.rotation,
        objectState.backImageUrl
      );
    });
  }
  
  // Process player state for current player
  const currentPlayerId = get(playerId);
  const playerState = state.playerStates?.[currentPlayerId];
  
  if (playerState) {
    // Process player's tray (hand)
    if (playerState.tray) {
      Object.entries(playerState.tray).forEach(([id, cardState]: [string, any]) => {
        trayStore.updateCardState(
          id,
          cardState.position,
          cardState.faceImageUrl,
          cardState.rotation
        );
      });
    }
    
    // Process player's decks
    if (playerState.decks) {
      Object.entries(playerState.decks).forEach(([id, deckState]: [string, any]) => {
        deckStore.updateDeck(id, deckState);
      });
    }
    
    // Process player's seat
    if (playerState.metadata?.seat !== undefined) {
      setSeat(playerState.metadata.seat);
    }
  }
}

/**
 * Process state update message
 */
function processUpdateMessage(message: any): void {
  if (!message.path || message.value === undefined) {
    return;
  }
  
  const [stateType, id, ...restPath] = message.path;
  
  logDebug(`Processing update - Path: ${message.path.join('.')}`, { 
    fromPlayer: message.playerId,
    messageId: message.messageId
  });
  
  switch (stateType) {
    case 'boardState':
      // Update object on board
      logDebug(`Applying board update for object: ${id}`);
      applyBoardUpdate(id, message.value, restPath);
      break;
      
    case 'playerStates':
      // Only process updates to current player's state
      if (id === get(playerId)) {
        logDebug(`Applying player update for current player`);
        applyPlayerUpdate(id, message.path.slice(2), message.value);
      } else {
        logDebug(`Skipping update for different player: ${id}`);
      }
      break;
      
    default:
      console.warn('Unknown state type in path:', stateType);
  }
}

/**
 * Apply update to object on board
 */
function applyBoardUpdate(objectId: string, value: any, propertyPath: string[]): void {
  if (propertyPath.length === 0) {
    // Full object update
    if (value === null) {
      // Object was deleted
      logDebug(`Removing card: ${objectId}`);
      objectStore.removeCard(objectId);
      return;
    }
    
    const { position, rotation, faceImageUrl, backImageUrl } = value;
    logDebug(`Updating card: ${objectId}`, { position, rotation });
    objectStore.updateCardState(objectId, position, faceImageUrl, rotation, backImageUrl);
    
    // Verify the update was applied
    setTimeout(() => {
      const updatedState = objectStore.getCardState(objectId);
      logDebug(`Card state after update: ${objectId}`, updatedState);
    }, 50);
  } else {
    // Partial object update
    const property = propertyPath[0];
    const currentState = objectStore.getCardState(objectId);
    
    if (!currentState) {
      logDebug(`Cannot apply partial update, card not found: ${objectId}`);
      return;
    }
    
    switch (property) {
      case 'position':
        logDebug(`Updating card position: ${objectId}`, value);
        objectStore.updateCardState(
          objectId, 
          value, 
          currentState.faceImageUrl, 
          currentState.rotation,
          currentState.backImageUrl
        );
        break;
        
      case 'rotation':
        logDebug(`Updating card rotation: ${objectId}`, value);
        objectStore.updateCardState(
          objectId, 
          currentState.position, 
          currentState.faceImageUrl, 
          value,
          currentState.backImageUrl
        );
        break;
        
      default:
        console.warn('Unknown property for board update:', property);
    }
  }
}

/**
 * Apply update to player state
 */
function applyPlayerUpdate(playerId: string, path: string[], value: any): void {
  if (path.length === 0) return;
  
  const [component, componentId, ...restPath] = path;
  
  switch (component) {
    case 'tray':
      // Update tray
      if (componentId) {
        if (value === null) {
          // Card was removed from tray
          trayStore.removeCard(componentId);
          return;
        }
        
        // Update specific card in tray
        const { position, rotation, faceImageUrl } = value;
        trayStore.updateCardState(componentId, position, faceImageUrl, rotation);
      }
      break;
      
    case 'decks':
      // Update deck
      if (componentId) {
        // Update specific deck
        deckStore.updateDeck(componentId, value);
      }
      break;
      
    case 'metadata':
      // Update player metadata
      if (componentId === 'seat') {
        setSeat(value);
      }
      break;
      
    default:
      console.warn('Unknown player component:', component);
  }
}

// Register the message processor with the websocket service
// This resolves the circular dependency
setMessageProcessor(processWebsocketMessage);
