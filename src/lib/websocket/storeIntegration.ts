import { deckStore } from '$lib/store/deckStore.svelte';
import { objectStore, type CardState } from '$lib/store/objectStore.svelte';
import { playerStore } from '$lib/store/playerStore.svelte';
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
	console.log('hit 1');
	return function passArgs(...args: any[]) {
		console.log('hit 2', args);
		console.log('spread logs player', ...args);

		return fn(...args);
	};
}

export function wsWrapperUpdateDeck(fn: Function) {
	return function passArgs(...args: any[]) {
		console.log('spread logs player', ...args);
		const [deckId, ...rest] = args;
		const cards = rest[0]?.cards;
		const cardsMap: Record<string, CardState> = {};
		if (Array.isArray(cards)) {
			cards.forEach((card: CardState & { id: string }) => {
				cardsMap[card.id] = card;
			});
		}
		const isFaceUp = rest[0]?.isFaceUp;
		const path = ['decks', deckId]; // add 'position' or other var to be more specific

		// Position could be an array or already an object, let's ensure it's an object with x, y, z
		const position = rest[0].position;
		let positionObj;

		if (Array.isArray(position)) {
			// If position is an array [x, y, z], convert to object {x, y, z}
			positionObj = {
				x: position[0],
				y: position[1],
				z: position[2]
			};
		} else if (typeof position === 'object') {
			// Position is already an object, make sure it has x, y, z fields
			positionObj = {
				x: position.x || 0,
				y: position.y || 0,
				z: position.z || 0
			};
		} else {
			// Fallback for any other case
			positionObj = { x: 0, y: 0, z: 0 };
		}

		console.log('Sending position as:', positionObj);
		const playerId = playerStore.getMe().id;
		sendMessage({
			type: 'update',
			path,
			value: {
				cards: cardsMap,
				isFaceUp,
				position: rest[0]?.position ? positionObj : undefined,
				rotation: { x: 0, y: 0, z: 0 }
			},
			playerId,
			timestamp: Date.now()
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

// ARCHIVE -- overcomplicated
// export function wsWrapper(fn: Function) {
// 	const nameOfArgs = fn
// 		.toString()
// 		.match(/\(([^)]*)\)/)?.[1]
// 		.split(',')
// 		.map((arg) => arg.trim().replace(/\/\*.*\*\//, '')) // Remove comments
// 		.map((arg) => arg.split('=')[0].trim()); // Remove default values
// 	console.log({ nameOfArgs });
// 	return function passArgs(...args: any[]) {
// 		console.log('spread logs', ...args);

//     // maps args to their names
// 		const obj = Object.fromEntries(
// 			args.map((arg, index) => [nameOfArgs?.[index], arg])
// 		);
// 		console.log('obj', obj);

// 		return fn(...args);
// 	};
// }
