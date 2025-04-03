/**
 * Websocket Client Module
 * Main entry point for websocket functionality
 */
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { connect, playerId } from './websocketService';
import { initializeStoreIntegrations } from './storeIntegration';

/**
 * Initialize websocket client and connect to server
 * This should be called once during app initialization
 */
export function initializeWebsocket(lobbyId: string = 'default'): void {
  if (!browser) return;
  
  // Initialize store integrations with current player ID
  initializeStoreIntegrations(get(playerId));
  
  // Connect to websocket server
  connect(lobbyId);
}

// Re-export everything from websocket service for easier imports
export * from './websocketService';
