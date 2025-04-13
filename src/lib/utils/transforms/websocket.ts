// NOTE: perhaps this should be in a helper file. The playerstore can crash the page if used before instatiated
import { playerStore } from '$lib/store/playerStore.svelte';

/**
 * Returns your playerId, timestamp, and type as update
 *
 * Useful to reduce code needed when using sendMessage
 * */
export function createWsMetaData() {
	const playerId = playerStore.getMe()?.id;
	const timestamp = Date.now();
	const type = 'update' as const;
	return { playerId, timestamp, type };
}
