import { deckStore } from '$lib/store/deckStore.svelte';
import { type CardState } from '$lib/store/objectStore.svelte';
import { playerStore } from '$lib/store/playerStore.svelte';
import { convertVec3ArrayToRecord } from '$lib/utils/transforms/data';
import { createWsMetaData } from '$lib/utils/transforms/websocket';
import { sendMessage } from './connection';

/**
 * THIS IS A WORKING TEST TO WRAP A FUNCTION TO PASS ARGUMENTS
 * This enables the existing function to work as intended.
 * Yet it will also enable the arguments to be passed to a seperate function
 *
 * The purpose of this is to construct a websocket folder without mixing functionality with client stores.
 * All websocket functionality should be in this folder and shadow the existing client functionality.
 *
 * MISSING: need to integrate who the message is coming from, to prevent broadcasting messages received from others
 * Just apply the changes from others without rebroadcasting them.
 *
 * */
export function wsWrapperObjectUpdate(fn: Function) {
	return function passArgs(...args: any[]) {
		console.log('spread logs', ...args);
		const props = {
			id: args[0],
			position: args[1],
			faceImageUrl: args[2],
			rotation: args[3],
			backImageUrl: args[4]
		};

		const path = ['cards', props.id];
		const { id, ...broadcastPayload } = props;
		const broadcast = { path, payload: broadcastPayload };
		console.log({ broadcast });

		return fn(...args);
	};
}

export function wsWrapperPlayerUpdate(fn: Function) {
	return function passArgs(...args: any[]) {
		console.log('ws player: spread args:', ...args);
		return fn(...args);
	};
}

export function wsWrapperUpdateDeck(fn: Function) {
	return function passArgs(...args: any[]) {
		console.log('ws deck: spread args', ...args);
		const [deckId, ...rest] = args;
		const cards = rest[0]?.cards;

		// TODO: this is bad to convert to record. Lose order. Server needs to accept an array for deck cards
		const cardsMap: Record<string, CardState> = {};
		if (Array.isArray(cards)) {
			cards.forEach((card: CardState & { id: string }) => {
				cardsMap[card.id] = card;
			});
		}

		// Position could be an array or already an object, let's ensure it's an object with x, y, z
		const position = convertVec3ArrayToRecord(rest[0].position);
		const rotation = convertVec3ArrayToRecord(rest[0].rotation);
		sendMessage({
			...createWsMetaData(),
			path: ['decks', deckId], // add 'position' or other var to be more specific
			value: {
				cards: cardsMap,
				isFaceUp: rest[0]?.isFaceUp,
				position,
				rotation
			}
		});

		return fn(...args);
	};
}

export function initWrappers() {
	// const originalFn = objectStore.updateCardState;
	// objectStore.updateCardState = wsWrapperObjectUpdate(originalFn);

	const originalFnUpdatePlayer = playerStore.addDeckToPlayer;
	playerStore.addDeckToPlayer = wsWrapperPlayerUpdate(originalFnUpdatePlayer);

	const originalFnUpdateDeck = deckStore.updateDeck;
	deckStore.updateDeck = wsWrapperUpdateDeck(originalFnUpdateDeck);
	deckStore.silentUpdateDeck = originalFnUpdateDeck;
}
