/**
 * Message Processor
 * Processes incoming websocket messages and updates stores accordingly
 */
import { get } from 'svelte/store';
import { objectStore } from '../store/objectStore.svelte';
import { trayStore } from '../store/trayStore.svelte';
import { deckStore } from '../store/deckStore.svelte';
import { seatStore, setSeat } from '../store/seatStore.svelte';
import { playerId } from './websocketService';

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
  // More aggressive filtering of own messages
  const currentPlayerId = get(playerId);
  
  // First check - ignore messages from self
  if (message.playerId === currentPlayerId) {
    logDebug(`Ignoring message from self by player ID: ${message.messageId || 'unknown'}`);
    return;
  }
  
  logDebug(`Processing message from ${message.playerId}, type: ${message.type}`, 
    message.path ? { path: message.path.join('.') } : null);
  
  // Second check - check for duplicate message IDs
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
    }, 10000); // Increased to 10 seconds to ensure we catch all duplicates
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
  
  // CRITICAL FIX: Ignore position updates for cards we're currently touching
  // This is the key fix that prevents feedback loops!
  const currentPlayerId = get(playerId);
  if (stateType === 'boardState' && 
      typeof message.value === 'object' && 
      message.value !== null &&        // Skip this check for null values (deletion)
      message.value.position) {        // Only check for position updates
      
    // Get the current state of this card to see if we're touching it
    const currentState = objectStore.getCardState(id);
    
    // Simple ownership check - we ignore updates for cards we're currently touching
    if (currentState?.lastTouchedBy === currentPlayerId && 
        (Date.now() - (currentState.lastTouchTime || 0)) < 2000) {
      // We're currently touching this card - IGNORE updates from other players
      logDebug(`IGNORING update for card ${id} - we are currently touching it`);
      return;
    }
  }
  
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
      
      // Check if this card is already removed to prevent feedback loops
      if (!objectStore.getCardState(objectId)) {
        logDebug(`Card ${objectId} already removed, skipping redundant removal`);
        return;
      }
      
      objectStore.removeCard(objectId);
      return;
    }
    
    const { position, rotation, faceImageUrl, backImageUrl } = value;
    logDebug(`Updating card: ${objectId}`, { position, rotation });
    
    // Force direct update to store with proper array format
    if (Array.isArray(position) && position.length === 3) {
      // Cast to proper position type [x, y, z]
      const typedPosition: [number, number, number] = [
        Number(position[0]), 
        Number(position[1]), 
        Number(position[2])
      ];
      
      console.log(`APPLYING UPDATE TO CARD ${objectId}:`, {
        position: typedPosition,
        from: 'board update'
      });
      
      // Direct store update - forcing the update to happen
      // Pass true as last parameter to indicate this is from sync
      objectStore.updateCardState(
        objectId, 
        typedPosition, 
        faceImageUrl, 
        rotation, 
        backImageUrl,
        true // Mark as coming from sync/server
      );
    } else {
      console.warn(`Invalid position format for card ${objectId}:`, position);
    }
    
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
        
        // Handle position update with proper type conversion
        if (Array.isArray(value) && value.length === 3) {
          const typedPosition: [number, number, number] = [
            Number(value[0]),
            Number(value[1]),
            Number(value[2])
          ];
          
          console.log(`APPLYING POSITION UPDATE TO CARD ${objectId}:`, {
            position: typedPosition,
            from: 'partial update'
          });
          
          objectStore.updateCardState(
            objectId, 
            typedPosition,
            currentState.faceImageUrl, 
            currentState.rotation,
            currentState.backImageUrl,
            true // Mark as coming from sync/server
          );
        } else {
          console.warn(`Invalid position format for card ${objectId}:`, value);
        }
        break;
        
      case 'rotation':
        logDebug(`Updating card rotation: ${objectId}`, value);
        objectStore.updateCardState(
          objectId, 
          currentState.position, 
          currentState.faceImageUrl, 
          value,
          currentState.backImageUrl,
          true // Mark as coming from sync/server
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
