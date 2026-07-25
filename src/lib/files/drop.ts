/**
 * The toast half of a file drop: `openTableFile` does the work, this reports
 * it. Parse failures surface as the parser's field-level message in a toast —
 * a dropped file is a user gesture, so its errors belong on screen, not in the
 * console.
 */

import toast from 'svelte-french-toast';
import { openTableFile, type OpenedFile, type OpenTableFileOptions } from './table-file';
import { prewarmGameState } from '$lib/packs/prewarm-state';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { get } from 'svelte/store';

/** True when a drag is carrying files (rather than text or a table card). */
export function isFileDrag(event: DragEvent): boolean {
	return [...(event.dataTransfer?.types ?? [])].includes('Files');
}

/** Returns what was opened, or undefined when it failed (already toasted). */
export async function openDroppedFile(
	file: File,
	opts: OpenTableFileOptions = {}
): Promise<OpenedFile | undefined> {
	try {
		const opened = await openTableFile(await file.text(), opts);
		if (opened.kind === 'pack') {
			// spawned content is only in the store now — repaint its sheet refs
			void prewarmGameState(get(gameStore), () => gameStore.updateStateSilently({}));
			toast(`Opened pack "${opened.pack.name}" — saved to your pack library`, { duration: 5000 });
			return opened;
		}
		for (const { id, reason } of opened.report?.failedPacks ?? []) {
			toast.error(`Pack '${id}' failed to load: ${reason}`, { duration: 6000 });
		}
		toast(
			opened.report
				? `Loaded scenario: ${opened.scenario.name}`
				: `Saved scenario: ${opened.scenario.name}`
		);
		return opened;
	} catch (error) {
		toast.error(
			`Could not open ${file.name}: ${error instanceof Error ? error.message : 'invalid file'}`,
			{ duration: 6000 }
		);
	}
}
