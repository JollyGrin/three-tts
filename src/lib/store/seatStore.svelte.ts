import { writable } from 'svelte/store';
import { DEG2RAD } from 'three/src/math/MathUtils.js';

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

function setSeat(seat?: 0 | 1 | 2 | 3) {
	if (seat === undefined)
		return seatStore.update((state) => ({
			seat: ((state.seat + 1) % 4) as SeatState['seat']
		}));

	seatStore.set({ seat });
}

export { seatStore, setSeat, degrees };
