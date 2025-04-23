import { gameStore } from '$lib/store/game/gameStore.svelte';
import type { GameDTO } from '$lib/store/game/types';
import { purgeUndefinedValues } from '$lib/utils/transforms/data';
import { createWsMetaData } from '$lib/utils/transforms/websocket';
import { sendMessage } from './connection';

/**
 * @deprecated
 * */
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

/**
 * @deprecated
 * */
export function wsWrapperPlayerUpdate(fn: Function) {
	return function passArgs(...args: any[]) {
		console.log('ws player: spread args:', args, ...args);
		const [playerId, ...rest] = args;
		const payload = purgeUndefinedValues({
			...rest[0]
		});
		sendMessage({
			...createWsMetaData(),
			value: {
				players: {
					[playerId]: payload
				}
			}
		});

		return fn(...args);
	};
}

/**
 * @deprecated
 * */
export function wsWrapperUpdateDeck(fn: Function) {
	return function passArgs(...args: any[]) {
		console.log('ws deck: spread args', ...args);
		const [deckId, ...rest] = args;
		// const cards = rest[0]?.cards;
		const payload = purgeUndefinedValues({
			...rest[0]
		});

		// Position could be an array or already an object, let's ensure it's an object with x, y, z
		sendMessage({
			...createWsMetaData(),
			// TODO: figure out how to include path for when args is just 1
			// path: ['decks', deckId], // add 'position' or other var to be more specific
			value: {
				decks: {
					[deckId]: payload
				}
			}
		});

		return fn(...args);
	};
}

export function wsWrapperUpdateGameState(fn: Function) {
	let lastSentTime = 0; // track the last time a message was sent
	let positionTimeout: ReturnType<typeof setTimeout> | null = null;
	let pendingPayload: any = null;
	return function passArgs(...args: any[]) {
		console.log('ws update gamestate: spread args', ...args);
		const metadata = createWsMetaData();
		if (!metadata.playerId || metadata.playerId === '') {
			console.warn(
				'wsWrapperUpdateGameState: No playerId found when creating websocket metadata'
			);
			return fn(...args);
		}

		const [...[rest]] = args;

		const payload = {
			...createWsMetaData(),
			value: { ...(rest as GameDTO) }
		};

		// NOTE: This is a hacky way to check if there are any position updates
		const hasPositionUpdate = Object.values(payload.value.cards || {}).some(
			(card: any) => !!card && Object.keys(card ?? {}).includes('position')
		);
		const now = Date.now();
		const limitMs = 200;
		if (hasPositionUpdate) {
			if (now - lastSentTime >= limitMs) {
				// Leading send
				lastSentTime = now;
				console.log('Position update: sending payload', payload);
				sendMessage(payload);
			} else {
				// Schedule trailing send
				pendingPayload = payload;
				const remaining = limitMs - (now - lastSentTime);
				if (!positionTimeout) {
					positionTimeout = setTimeout(() => {
						lastSentTime = Date.now();
						console.log('Position update: sending trailing payload', pendingPayload);
						sendMessage(pendingPayload);
						positionTimeout = null;
						pendingPayload = null;
					}, remaining);
				}
			}
		} else {
			console.log('Immediate (non-position): sending payload', payload);
			sendMessage(payload);
		}

		return fn(...args);
	};
}

export function initWrappers() {
	const originalFn = gameStore.updateState;
	gameStore.updateState = wsWrapperUpdateGameState(originalFn);
	gameStore.updateStateSilently = originalFn;
}
