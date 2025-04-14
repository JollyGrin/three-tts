import type { CardState } from '../src/lib/store/objectStore.svelte';
import type { PlayerDTO } from '../src/lib/store/playerStore.svelte';
import type { DeckDTO } from '../src/lib/store/deckStore.svelte';

type Overlay = {
	type: 'grid' | 'image';
	position: [number, number, number];
	rotation: [number, number, number];
	grid?: {
		rows: number;
		columns: number;
	};
	image?: {
		src: string;
		width: number;
		height: number;
	};
};

type GameState = {
	/**
	 * Track all players and their metadata (life/resources)
	 * Initiate decks and add deckId
	 * Subscribed to tray and seat, so no need to track those individually
	 * */
	players: Record<string, PlayerDTO>;
	/**
	 * Decks on the table. Add deckid to playerStore to claim ownership
	 * */
	decks: Record<string, DeckDTO>;
	/**
	 * Cards on the table. Tracks their position, rotation, face and back image.
	 * */
	table: Record<string, CardState>;
	/**
	 * Overlay on the map. Could be a grid or an image. Will be behind the cards
	 * */
	overlay?: Overlay;
};
