import { writable } from 'svelte/store';

/**
 * Which table surfaces the current route mounts.
 *
 * `TableScene` publishes this from its props so the pieces that resolve a drop
 * (`commit.ts`, `DropIndicator`) can't offer a target the route never rendered.
 * The pack editor is the case that needs it: `/create` has no hand — a hand
 * holds cards no pack can represent, and a card dropped there would survive
 * every preview respawn invisibly.
 */
export interface TableFeatures {
	/** whether the local hand tray is mounted, and so may win a drop */
	hand: boolean;
}

export const TABLE_FEATURES_DEFAULT: TableFeatures = { hand: true };

export const tableFeatures = writable<TableFeatures>({ ...TABLE_FEATURES_DEFAULT });

export function setTableFeatures(patch: Partial<TableFeatures>) {
	tableFeatures.set({ ...TABLE_FEATURES_DEFAULT, ...patch });
}
