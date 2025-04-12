import { deckStore } from '$lib/store/deckStore.svelte';
import { objectStore, type CardState } from '$lib/store/objectStore.svelte';
import { playerStore } from '$lib/store/playerStore.svelte';
import { purgeUndefinedValues } from '$lib/utils/transforms/data';
import { createWsMetaData } from '$lib/utils/transforms/websocket';
import { sendMessage } from './connection';

export function wsWrapperObjectUpdate(fn: Function) {
	return function passArgs(...args: any[]) {
		const [cardId, ...rest] = args;

		console.log('PAYLOAD WS SEND:', args, rest);
		const payload = purgeUndefinedValues({
			...rest[0],
			position: rest[0]?.position,
			rotation: rest[0]?.rotation
		});
		console.log('ws object: payload being passed', payload);

		sendMessage({
			...createWsMetaData(),
			// path: ['objects', cardId, ...[key]].filter((e) => e !== undefined), // add 'position' or other var to be more specific
			value: {
				objects: {
					[cardId]: payload
				}
			}
		});

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

		// Position could be an array or already an object, let's ensure it's an object with x, y, z
		sendMessage({
			...createWsMetaData(),
			// TODO: figure out how to include path for when args is just 1
			// path: ['decks', deckId], // add 'position' or other var to be more specific
			value: {
				decks: {
					[deckId]: {
						cards: cards,
						isFaceUp: rest[0]?.isFaceUp,
						position: rest[0].position,
						rotation: rest[0].rotation
					}
				}
			}
		});

		return fn(...args);
	};
}

export function initWrappers() {
	const originalFnUpdateObject = objectStore.updateCard;
	objectStore.updateCard = wsWrapperObjectUpdate(originalFnUpdateObject);
	objectStore.silentUpdateCard = originalFnUpdateObject;

	const originalFnUpdatePlayer = playerStore.addDeckToPlayer;
	playerStore.addDeckToPlayer = wsWrapperPlayerUpdate(originalFnUpdatePlayer);

	const originalFnUpdateDeck = deckStore.updateDeck;
	deckStore.updateDeck = wsWrapperUpdateDeck(originalFnUpdateDeck);
	deckStore.silentUpdateDeck = originalFnUpdateDeck;
}
