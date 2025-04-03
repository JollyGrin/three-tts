/**
 * Utility functions for handling state operations
 */
import type { GameState } from '../models/types';

/**
 * Get value at specified path in state
 */
export function getValueAtPath(state: any, path: string[]): any {
  return path.reduce((obj, key) => 
    (obj && typeof obj === 'object') ? obj[key] : undefined, 
    state);
}

/**
 * Set value at specified path in state
 * Returns a new state object without mutating the original
 */
export function setValueAtPath(state: any, path: string[], value: any): any {
  // Create a deep clone to avoid direct mutations
  const newState = structuredClone(state);
  
  // Handle root level updates
  if (path.length === 0) return value;
  
  // Navigate to the parent object where the update should happen
  const parent = path.slice(0, -1).reduce((obj, key) => {
    if (!(key in obj)) obj[key] = {};
    return obj[key];
  }, newState);
  
  // Set the value at the final key
  const lastKey = path[path.length - 1];
  
  if (value === undefined || value === null) {
    // Remove the property if value is null/undefined
    delete parent[lastKey];
  } else {
    // Set the new value
    parent[lastKey] = value;
  }
  
  return newState;
}

/**
 * Check if a player has permission to update a path
 */
export function hasPermission(playerId: string, path: string[]): boolean {
  if (path.length === 0) return false;
  
  // Anyone can update board state
  if (path[0] === 'boardState') return true;
  
  // Player state updates are restricted to the owner
  if (path[0] === 'playerStates') {
    // Check if updating their own player state
    return path.length > 1 && path[1] === playerId;
  }
  
  return false;
}

/**
 * Create initial game state for a new lobby
 */
export function createInitialGameState(): GameState {
  return {
    boardState: {},
    playerStates: {}
  };
}
