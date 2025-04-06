import { objectStore } from '$lib/store/objectStore.svelte';

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

export function initWrappers() {
	const originalFn = objectStore.updateCardState;
	objectStore.updateCardState = wsWrapperObjectUpdate(originalFn);
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
