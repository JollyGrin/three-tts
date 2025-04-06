import { deckStore } from '$lib/store/deckStore.svelte';
import { objectStore } from '$lib/store/objectStore.svelte';
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
		const path = ['decks', deckId, 'position'];
		const playerId = playerStore.getMe().id;
		sendMessage({
			type: 'update',
			path,
			value: rest.position,
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
