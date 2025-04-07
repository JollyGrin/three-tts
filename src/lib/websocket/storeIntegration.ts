import { deckStore } from '$lib/store/deckStore.svelte';
import { objectStore, type CardState } from '$lib/store/objectStore.svelte';
import { playerStore } from '$lib/store/playerStore.svelte';
import {
	convertVec3ArrayToRecord,
	purgeUndefinedValues
} from '$lib/utils/transforms/data';
import { createWsMetaData } from '$lib/utils/transforms/websocket';
import { sendMessage } from './connection';

export function wsWrapperObjectUpdate(fn: Function) {
	return function passArgs(...args: any[]) {
		const [cardId, ...rest] = args;

		const position = convertVec3ArrayToRecord(rest[0]?.position);
		const rotation = convertVec3ArrayToRecord(rest[0]?.rotation);
		const payload = purgeUndefinedValues({ ...rest[0], position, rotation });

		// if payload is just one key, make the update surgical
		let key;
		if (Object.entries(payload).length === 1) {
			key = Object.keys(payload)[0];
		}

		console.log(
			'ws object: path:',
			['objects', cardId, ...[key]].filter((e) => e !== undefined)
		);
		console.log('ws object: payload being passed', payload);

		sendMessage({
			...createWsMetaData(),
			path: ['objects', cardId, ...[key]].filter((e) => e !== undefined), // add 'position' or other var to be more specific
			value: payload
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
			// TODO: figure out how to include path for when args is just 1
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
	const originalFnUpdateObject = objectStore.updateCard;
	objectStore.updateCard = wsWrapperObjectUpdate(originalFnUpdateObject);
	objectStore.silentUpdateCard = originalFnUpdateObject;

	const originalFnUpdatePlayer = playerStore.addDeckToPlayer;
	playerStore.addDeckToPlayer = wsWrapperPlayerUpdate(originalFnUpdatePlayer);

	const originalFnUpdateDeck = deckStore.updateDeck;
	deckStore.updateDeck = wsWrapperUpdateDeck(originalFnUpdateDeck);
	deckStore.silentUpdateDeck = originalFnUpdateDeck;
}
