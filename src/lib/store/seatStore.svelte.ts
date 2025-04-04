import { writable, get } from 'svelte/store';
import { DEG2RAD } from 'three/src/math/MathUtils.js';
import { orderedPlayerList, playerId } from '../websocket/websocketService';

interface SeatState {
	seat:
		| 0 // 0deg
		| 1 // 180deg
		| 2 // 90deg
		| 3; // 270deg
}

const degrees = [0, DEG2RAD * 180, DEG2RAD * 90, DEG2RAD * 270] as const;

const initialState: SeatState = {
	seat: 0
};

const seatStore = writable<SeatState>(initialState);

// Subscribe to orderedPlayerList changes to auto-assign seats based on join order
orderedPlayerList.subscribe(players => {
  const currentPlayerId = get(playerId);

  // Find our position in the ordered players list
  const playerIndex = players.findIndex(p => p.id === currentPlayerId);
  
  // Only proceed if we found the player
  if (playerIndex !== -1) {
    // Calculate seat based on position (modulo 4 to wrap around)
    const calculatedSeat = playerIndex % 4 as SeatState['seat'];
    
    // Set the seat position
    seatStore.update(state => {
      // Only update if it's different to avoid feedback loops
      if (state.seat !== calculatedSeat) {
        console.log(`[Seat] Auto-assigning seat ${calculatedSeat} based on join order (player at position ${playerIndex})`);
        return { seat: calculatedSeat };
      }
      return state;
    });
  }
});

function setSeat(seat?: 0 | 1 | 2 | 3) {
	if (seat === undefined)
		return seatStore.update((state) => ({
			seat: ((state.seat + 1) % 4) as SeatState['seat']
		}));

	seatStore.set({ seat });
}

export { seatStore, setSeat, degrees };
