/**
 * The action channel: gameplay moves that the server has to arbitrate.
 *
 * Anything that touches hidden information (draw, tray, flip, peek, shuffle) or
 * that two players can fight over (grab, drop) is a *request*, not a fait
 * accompli — the client says what it wants, the server decides, and the
 * resulting state comes back through the normal patch stream.
 *
 * With no server (the /setup editor runs deliberately offline) there is nothing
 * to arbitrate and nothing to hide: `sendGameAction` returns false and callers
 * fall back to applying the move locally.
 */

import { isWebSocketConnected, sendMessage } from '$lib/websocket/connection';
import { flushPendingUpdate } from '$lib/websocket/storeIntegration';
import { gameActions } from '.';

export type GameActionName =
	| 'grab'
	| 'drop'
	| 'flip'
	| 'peek'
	| 'reveal'
	| 'tray'
	| 'untray'
	| 'draw'
	| 'placeOnDeck'
	| 'shuffle'
	| 'claimSeat';

export type GameActionPayload = {
	/** card or piece id; `piece:`-prefixed ids address a piece */
	id?: string;
	deckId?: string;
	position?: [number, number, number];
	rotation?: [number, number, number];
	seat?: number;
};

/** True when the server is the authority — i.e. actions are worth sending. */
export function isServerAuthoritative(): boolean {
	return isWebSocketConnected();
}

/**
 * Send one action. Returns false when there is no server, which callers read as
 * "you are the authority, apply it yourself".
 */
export function sendGameAction(action: GameActionName, payload: GameActionPayload = {}): boolean {
	if (!isWebSocketConnected()) return false;
	const playerId = gameActions.getMyId();
	if (!playerId) return false;

	// A queued drag frame must not overtake the action that ends the drag: the
	// throttle can be holding a trailing position update, and a move that lands
	// after its `drop` no longer has a lease to ride on.
	flushPendingUpdate();

	return sendMessage({
		type: 'action',
		playerId,
		timestamp: Date.now(),
		value: { action, ...payload }
	});
}
