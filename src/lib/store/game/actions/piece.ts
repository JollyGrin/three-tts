import { get } from 'svelte/store';
import { gameStore } from '../gameStore.svelte';

function getPieceState(pieceId: string) {
	return get(gameStore)?.pieces?.[pieceId];
}

function removePiece(pieceId: string) {
	return gameStore.updateState({ pieces: { [pieceId]: null } });
}

function movePiece(pieceId: string, position: [number, number, number]) {
	return gameStore.updateState({ pieces: { [pieceId]: { position } } });
}

/** Adjust a counter piece's value, clamped to [0, maxValue] */
function incrementCounter(pieceId: string, delta: number) {
	const piece = getPieceState(pieceId);
	if (!piece || piece.kind !== 'counter') return;
	const max = piece.maxValue ?? 99;
	const value = Math.min(max, Math.max(0, (piece.value ?? max) + delta));
	return gameStore.updateState({ pieces: { [pieceId]: { value } } });
}

export const pieceActions = {
	getPieceState,
	removePiece,
	movePiece,
	incrementCounter
};
