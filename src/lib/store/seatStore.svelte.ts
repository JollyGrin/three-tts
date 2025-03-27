import { writable } from 'svelte/store';

interface SeatState {
	seat: 0 | 1 | 2 | 3;
}

const initialState: SeatState = {
	seat: 0
};

const seatStore = writable<SeatState>(initialState);

function setSeat(seat?: 0 | 1 | 2 | 3) {
	if (!seat)
		return seatStore.update((state) => ({
			seat: ((state.seat + 1) % 4) as SeatState['seat']
		}));

	seatStore.set({ seat });
}

export { seatStore, setSeat };
