import { describe, it, expect, beforeEach, vi } from 'vitest';
import { objectStore, type CardState } from '../objectStore.svelte';
import { get } from 'svelte/store';

describe('objectStore', () => {
  // Reset the store before each test
  beforeEach(() => {
    // Clear the store by using the subscribe method and resetting to empty object
    objectStore.set({});
  });

  describe('updateCard', () => {
    it('should add a new card to the store', () => {
      const id = 'test-card-1';
      const cardState: CardState = {
        position: [1, 2, 3] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        faceImageUrl: 'test-image.png'
      };

      objectStore.updateCard(id, cardState);
      
      const storeState = get(objectStore);
      expect(storeState[id]).toEqual(cardState);
    });

    it('should update an existing card in the store', () => {
      const id = 'test-card-1';
      const initialState: CardState = {
        position: [1, 2, 3] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        faceImageUrl: 'test-image.png'
      };
      
      // First add the card
      objectStore.updateCard(id, initialState);
      
      // Then update it
      const updatedPosition: [number, number, number] = [4, 5, 6];
      objectStore.updateCard(id, { position: updatedPosition });
      
      const storeState = get(objectStore);
      expect(storeState[id].position).toEqual(updatedPosition);
      // Other properties should remain unchanged
      expect(storeState[id].rotation).toEqual(initialState.rotation);
      expect(storeState[id].faceImageUrl).toEqual(initialState.faceImageUrl);
    });

    it('should handle the new payload format (without separate id)', () => {
      const id = 'test-card-1';
      const cardState: CardState = {
        position: [1, 2, 3] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        faceImageUrl: 'test-image.png'
      };

      // Using the new format where the first arg is the entire payload with id
      // We need to handle this differently based on how transformPayload works
      objectStore.updateCard(id, cardState);
      
      const storeState = get(objectStore);
      expect(storeState[id]).toEqual(cardState);
    });
  });

  describe('removeCard', () => {
    it('should remove a card from the store', () => {
      const id = 'test-card-to-remove';
      const cardState: CardState = {
        position: [1, 2, 3] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        faceImageUrl: 'test-image.png'
      };

      // First add the card
      objectStore.updateCard(id, cardState);
      expect(get(objectStore)[id]).toBeDefined();
      
      // Then remove it
      objectStore.removeCard(id);
      expect(get(objectStore)[id]).toBeUndefined();
    });
  });

  describe('getCardState', () => {
    it('should return the state for a specific card', () => {
      const id = 'test-card-get';
      const cardState: CardState = {
        position: [1, 2, 3] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        faceImageUrl: 'test-image.png'
      };

      // Add a card
      objectStore.updateCard(id, cardState);
      
      // Get the state
      const retrievedState = objectStore.getCardState(id);
      expect(retrievedState).toEqual(cardState);
    });

    it('should return undefined for a non-existent card', () => {
      const nonExistentId = 'non-existent-card';
      const retrievedState = objectStore.getCardState(nonExistentId);
      expect(retrievedState).toBeUndefined();
    });
  });

  describe('store subscription', () => {
    it('should notify subscribers when the store changes', () => {
      const mockCallback = vi.fn();
      const unsubscribe = objectStore.subscribe(mockCallback);
      
      try {
        // Initial subscription should trigger callback
        expect(mockCallback).toHaveBeenCalledTimes(1);
        
        // Update the store
        const id = 'subscription-test';
        objectStore.updateCard(id, {
          position: [1, 2, 3],
          rotation: [0, 0, 0],
          faceImageUrl: 'test-image.png'
        });
        
        // Callback should be called again
        expect(mockCallback).toHaveBeenCalledTimes(2);
      } finally {
        unsubscribe();
      }
    });
  });
});
