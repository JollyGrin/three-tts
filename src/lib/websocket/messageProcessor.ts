/**
 * Message Processor
 * Processes incoming websocket messages and updates stores accordingly
 */
import { get } from 'svelte/store';
import { objectStore } from '../store/objectStore.svelte';
import { trayStore } from '../store/trayStore.svelte';
import { deckStore } from '../store/deckStore.svelte';
import { seatStore } from '../store/seatStore.svelte';
import { playerId } from './websocketService';

/**
 * Process incoming websocket message and update appropriate stores
 */
export function processWebsocketMessage(message: any): void {
  // Ignore messages from self (already processed when sending)
  if (message.playerId === get(playerId)) {
    return;
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
      seatStore.setSeat(playerState.metadata.seat);
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
  
  switch (stateType) {
    case 'boardState':
      // Update object on board
      applyBoardUpdate(id, message.value, restPath);
      break;
      
    case 'playerStates':
      // Only process updates to current player's state
      if (id === get(playerId)) {
        applyPlayerUpdate(id, message.path.slice(2), message.value);
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
    const { position, rotation, faceImageUrl, backImageUrl } = value;
    objectStore.updateCardState(objectId, position, faceImageUrl, rotation, backImageUrl);
  } else {
    // Partial object update
    const property = propertyPath[0];
    const currentState = objectStore.getCardState(objectId);
    
    if (!currentState) return;
    
    switch (property) {
      case 'position':
        objectStore.updateCardState(
          objectId, 
          value, 
          currentState.faceImageUrl, 
          currentState.rotation
        );
        break;
        
      case 'rotation':
        objectStore.updateCardState(
          objectId, 
          currentState.position, 
          currentState.faceImageUrl, 
          value
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
        seatStore.setSeat(value);
      }
      break;
      
    default:
      console.warn('Unknown player component:', component);
  }
}
