import { writable } from 'svelte/store';
import type { GameDTO } from './types';
import { merge } from '../transform-helpers';

const initGameState = {
	players: {},
	decks: {},
	cards: {}
};
const game = writable<Partial<GameDTO>>(initGameState);

function findNullPaths(
	obj: Record<string, any>,
	currentPath: string[] = []
): string[][] {
	const nullPaths: string[][] = [];

	for (const [key, value] of Object.entries(obj)) {
		const newPath = [...currentPath, key];

		if (value === null) {
			nullPaths.push(newPath); // 👈 wrap it
		} else if (typeof value === 'object' && value !== null) {
			nullPaths.push(...findNullPaths(value, newPath));
		}
	}

	return nullPaths;
}

function removePathFromObject(obj: any, path: string[]): any {
	if (path.length === 0) return obj;

	const [firstKey, ...restPath] = path;

	if (!(firstKey in obj)) return obj;

	// At the final key: remove it
	if (restPath.length === 0) {
		const { [firstKey]: _, ...rest } = obj;
		return rest;
	}

	// Recurse deeper
	return {
		...obj,
		[firstKey]: removePathFromObject(obj[firstKey], restPath)
	};
}

function updateState(update: Partial<GameDTO>) {
	const paths = findNullPaths(update);

	if (paths.length > 0) {
		game.update((state) => {
			let newState = { ...state };

			for (const path of paths) {
				newState = removePathFromObject(newState, path);
			}

			return newState;
		});
	} else {
		game.update((state) => merge(state, update));
	}
}

export const gameStore = {
	...game,
	updateState
};
