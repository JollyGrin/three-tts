/**
 * Store Integration
 * Connects existing stores with websocket functionality
 */
import { get } from 'svelte/store';
import { sendUpdate, playerId } from './websocketService';
import { objectStore } from '../store/objectStore.svelte';
import { trayStore } from '../store/trayStore.svelte';
import { deckStore } from '../store/deckStore.svelte';
import { seatStore, setSeat } from '../store/seatStore.svelte';

/**
 * Higher-order function to wrap store update methods with websocket sync
 */
export function withWebsocketSync<T extends (...args: any[]) => void>(
  updateFn: T,
  pathGenerator: (...args: Parameters<T>) => string[]
): T {
  return ((...args: Parameters<T>) => {
    // Call the original update function
    updateFn(...args);
    
    // Generate path from function arguments
    const path = pathGenerator(...args);
    
    // Skip sending updates for cards being dragged by others
    if (path[0] === 'boardState') {
      const cardId = path[1];
      const cardState = objectStore.getCardState(cardId);
      const currentPlayerId = get(playerId);
      
      if (cardState?.lastTouchedBy &&
          cardState.lastTouchedBy !== currentPlayerId &&
          Date.now() - (cardState.lastTouchTime || 0) < 2000) {
        console.log(`Not sending update for ${cardId} - owned by ${cardState.lastTouchedBy}`);
        return; // Don't send update for card owned by another player
      }
    }
    
    // Get value to send (depends on the path and store)
    // This is simplified - in a real implementation you'd extract the exact value
    // that changed based on the path
    const value = extractValueFromPath(path);
    
    // Send update to server
    sendUpdate(path, value);
  }) as T;
}

/**
 * Extract a value from the store based on the path
 */
function extractValueFromPath(path: string[]): any {
  if (path.length < 2) return undefined;
  
  const [storeType, id, ...restPath] = path;
  
  switch (storeType) {
    case 'boardState':
      // Get card state from object store
      return objectStore.getCardState(id);
      
    case 'playerStates':
      if (path.length < 3) return undefined;
      
      const component = path[2];
      
      if (component === 'tray' && path.length > 3) {
        // Get card from tray
        const cardId = path[3];
        return trayStore.getCardState(cardId);
      }
      
      if (component === 'decks' && path.length > 3) {
        // Get deck state
        const deckId = path[3];
        return { /* Get deck state */ };
      }
      
      return undefined;
      
    default:
      return undefined;
  }
}

/**
 * Apply websocket sync to object store
 */
export function applyWebsocketToObjectStore(): void {
  // Wrap updateCardState with websocket sync
  const originalUpdateCardState = objectStore.updateCardState;
  objectStore.updateCardState = withWebsocketSync(
    originalUpdateCardState,
    (id, position, faceImageUrl, rotation, backImageUrl) => ['boardState', id]
  );
  
  // Wrap removeCard with websocket sync
  const originalRemoveCard = objectStore.removeCard;
  objectStore.removeCard = withWebsocketSync(
    originalRemoveCard,
    (id) => ['boardState', id]
  );
}

/**
 * Apply websocket sync to tray store
 */
export function applyWebsocketToTrayStore(playerId: string): void {
  // Wrap updateCardState with websocket sync
  const originalUpdateCardState = trayStore.updateCardState;
  trayStore.updateCardState = withWebsocketSync(
    originalUpdateCardState,
    (id, position, faceImageUrl, rotation) => ['playerStates', playerId, 'tray', id]
  );
  
  // Wrap removeCard with websocket sync
  const originalRemoveCard = trayStore.removeCard;
  trayStore.removeCard = withWebsocketSync(
    originalRemoveCard,
    (id) => ['playerStates', playerId, 'tray', id]
  );
}

/**
 * Apply websocket sync to deck store
 */
export function applyWebsocketToDeckStore(playerId: string): void {
  // Wrap updateDeck with websocket sync
  const originalUpdateDeck = deckStore.updateDeck;
  deckStore.updateDeck = withWebsocketSync(
    originalUpdateDeck,
    (id, updatedState) => {
      // Check if this is a player's deck or a shared deck
      if (id.startsWith(`deck:${playerId}`)) {
        return ['playerStates', playerId, 'decks', id];
      }
      // Shared decks are on the board
      return ['boardState', id];
    }
  );
}

/**
 * Apply websocket sync to seat store
 */
export function applyWebsocketToSeatStore(playerId: string): void {
  // Wrap setSeat with websocket sync
  const originalSetSeat = setSeat;
  
  // Create a wrapped version that sends updates to the server
  const wrappedSetSeat = withWebsocketSync(
    originalSetSeat,
    (seat) => ['playerStates', playerId, 'metadata', 'seat']
  );
  
  // This overrides the imported function
  // @ts-ignore - ignore TypeScript error about setSeat not being on seatStore
  global.setSeat = wrappedSetSeat;
}

/**
 * Initialize all store integrations 
 */
export function initializeStoreIntegrations(playerId: string): void {
  applyWebsocketToObjectStore();
  applyWebsocketToTrayStore(playerId);
  applyWebsocketToDeckStore(playerId);
  applyWebsocketToSeatStore(playerId);
}
