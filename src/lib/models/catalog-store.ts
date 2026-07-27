/**
 * The browser's copy of the model catalog manifest.
 *
 * One fetch per session, shared by everything that resolves `model:` refs —
 * the renderer, the catalog browser pane, the /create ref preview. A classic
 * writable store (like `sheetRefCache`) so components re-render when the
 * manifest lands; the promise is cached too, for callers that want to await
 * rather than subscribe.
 *
 * A missing or unreachable manifest resolves to `null` and stays that way —
 * every consumer treats that exactly like an unknown ref (placeholder, empty
 * browser), never an exception.
 */

import { get, writable } from 'svelte/store';
import { MODEL_CATALOG_URL, type ModelCatalog } from './catalog';

export const modelCatalog = writable<ModelCatalog | null>(null);

let pending: Promise<ModelCatalog | null> | null = null;

/** Fetch the manifest once; safe to call from anywhere, any number of times. */
export function ensureModelCatalog(): Promise<ModelCatalog | null> {
	const loaded = get(modelCatalog);
	if (loaded) return Promise.resolve(loaded);
	if (pending) return pending;
	if (typeof fetch === 'undefined') return Promise.resolve(null);
	pending = fetch(MODEL_CATALOG_URL)
		.then(async (response) => {
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const catalog = (await response.json()) as ModelCatalog;
			if (!catalog || typeof catalog.kits !== 'object') throw new Error('malformed manifest');
			modelCatalog.set(catalog);
			return catalog;
		})
		.catch((error) => {
			console.warn('[models] catalog manifest unavailable:', error);
			// allow a retry on the next call rather than caching the failure forever
			pending = null;
			return null;
		});
	return pending;
}
