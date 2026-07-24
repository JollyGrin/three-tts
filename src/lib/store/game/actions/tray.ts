import { get } from 'svelte/store';
import { gameStore } from '../gameStore.svelte';
import type { GameDTO } from '../types';
import { sendGameAction } from './net';

/**
 * Put a table card into a player's hand.
 *
 * Online this is a server action, for two reasons: the card may be one you
 * cannot see (so the client has no contents to move), and a hand is the one
 * collection that is never sent to anybody else — the move has to happen on the
 * side of the boundary that still holds the card.
 * */
function moveCardToTray(cardId: string, playerId: string) {
	if (sendGameAction('tray', { id: cardId })) {
		// mirror the visible half so the card leaves the table immediately; the
		// hand itself comes back from the server
		return gameStore.updateStateSilently({ cards: { [cardId]: null } });
	}

	const card = get(gameStore)?.cards?.[cardId] as NonNullable<
		GameDTO['cards'][string]
	>;
	return gameStore.updateState({
		cards: { [cardId]: null },
		players: { [playerId]: { tray: { [cardId]: card } } }
	});
}

/**
 * Take a card back out of your hand and onto the table, facedown.
 *
 * With a `placement` the card is materialized on the table too, ready to drag.
 * Online that is the server's job — the card lands hidden from everyone, this
 * player included, so only its back is painted locally and the face stays
 * behind rather than lingering in the store. Offline we are the authority and
 * carry the face across ourselves.
 *
 * Returns what the client knew about the card.
 * */
function moveCardOutOfTray(
	cardId: string,
	playerId: string,
	placement?: {
		position: [number, number, number];
		rotation: [number, number, number];
		backImageUrl?: string;
	}
) {
	const card = get(gameStore)?.players?.[playerId]?.tray?.[cardId];
	const emptySlot = { players: { [playerId]: { tray: { [cardId]: null } } } };

	if (!placement) {
		gameStore.updateState(emptySlot);
		return card; // returns card to hoist into cards for dragging
	}

	const { backImageUrl, ...transform } = placement;
	const onTable = {
		...transform,
		visibility: { kind: 'hidden' as const },
		backImageUrl: card?.backImageUrl ?? backImageUrl
	};

	if (sendGameAction('untray', { id: cardId, ...transform })) {
		gameStore.updateStateSilently({ ...emptySlot, cards: { [cardId]: onTable } });
		return card;
	}

	gameStore.updateState({
		...emptySlot,
		cards: { [cardId]: { ...onTable, faceImageUrl: card?.faceImageUrl } }
	});
	return card;
}

export const trayActions = {
	moveCardToTray,
	moveCardOutOfTray
};
