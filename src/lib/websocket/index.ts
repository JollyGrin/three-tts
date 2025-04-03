/**
 * Websocket main entry point
 * This file orchestrates the initialization of the websocket client
 */

import { browser } from '$app/environment';
import { connect, playerId, setMessageProcessor } from './websocketService';
import { get } from 'svelte/store';
import { initializeStoreIntegrations } from './storeIntegration';
import { processWebsocketMessage } from './messageProcessor';

const DEBUG = true;

export function logDebug(message: string, data?: any) {
  if (DEBUG) {
    console.log(`[WS-INIT] ${message}`, data || '');
  }
}

/**
 * Initialize the websocket client
 * This should be called once when the app starts
 */
export async function initializeWebsocket(lobbyId: string = 'default') {
  if (!browser) {
    // Skip during SSR
    logDebug('Skipping websocket initialization during SSR');
    return;
  }

  logDebug('Initializing websocket client');
  
  // First set up the message processor to break circular dependency
  logDebug('Setting up message processor');
  setMessageProcessor(processWebsocketMessage);
  
  // Connect to the websocket server
  const wsUrl = import.meta.env.DEV
    ? `ws://localhost:3000` // Development
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`; // Production
  
  logDebug(`Connecting to websocket server at ${wsUrl}`);
  
  try {
    // Connect to websocket server with the correct parameter order
    await connect(wsUrl, lobbyId);
    
    // Get the player ID that was assigned
    const currentPlayerId = get(playerId);
    logDebug(`Connected as player ${currentPlayerId}`);
    
    // Initialize store integrations with the player ID
    initializeStoreIntegrations(currentPlayerId);
    logDebug('Store integrations initialized');
    
    return currentPlayerId;
  } catch (error) {
    console.error('Failed to initialize websocket:', error);
    throw error;
  }
}

// Re-export the playerId store
export { playerId };
