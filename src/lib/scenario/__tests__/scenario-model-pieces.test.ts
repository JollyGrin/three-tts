/**
 * A built cave map must survive the scenario pipeline (tableplace-135):
 * model pieces placed on the table → save → reload → export/import, keeping
 * their catalog ref, yaw and snap opt-out. The pieces travel through
 * `state.pieces` like every hand-spawned piece — the ref is one string, so
 * nothing new syncs — which is exactly what this pins down.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import {
	applyScenario,
	ensureSeatPlaceholder,
	getScenario,
	importScenarioFromText,
	saveScenario,
	seatPlaceholderId
} from '../scenario';

function buildCaveTable() {
	gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
	ensureSeatPlaceholder(0);
	const owner = seatPlaceholderId(0);
	const room = gameActions.addPiece('model', {
		ownerId: owner,
		name: 'room-large',
		model: 'model:kenney-cave/room-large',
		radius: 7.07,
		position: [4, 0.335, -2]
	});
	// a rotated corridor with the snap opt-out, to round-trip every model field
	const corridor = gameActions.addPiece('model', {
		ownerId: owner,
		name: 'corridor',
		model: 'model:kenney-cave/corridor',
		position: [8, 0.335, -2],
		snap: false
	});
	gameActions.rotatePiece(corridor, 90);
	return { room, corridor };
}

describe('scenario round-trip with model pieces', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('saves and reloads a cave layout intact', () => {
		const { room, corridor } = buildCaveTable();
		const before = get(gameStore).pieces;
		saveScenario('cave-test');

		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
		applyScenario(getScenario('cave-test')!);

		const after = get(gameStore).pieces ?? {};
		expect(after).toEqual(before);
		expect(after[room]).toMatchObject({
			kind: 'model',
			model: 'model:kenney-cave/room-large',
			position: [4, 0.335, -2]
		});
		expect(after[corridor]).toMatchObject({
			kind: 'model',
			model: 'model:kenney-cave/corridor',
			rotation: [0, 90, 0],
			snap: false
		});
	});

	it('survives an export/import of the scenario file text', () => {
		buildCaveTable();
		const saved = saveScenario('cave-file');
		const reimported = importScenarioFromText(JSON.stringify(saved, null, '\t'));
		expect(reimported.state.pieces).toEqual(saved.state.pieces);
	});
});
