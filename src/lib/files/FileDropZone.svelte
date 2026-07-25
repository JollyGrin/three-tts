<script lang="ts">
	/**
	 * Drop a `.tbpp.json` / `.tbps.json` anywhere on the page to open it.
	 *
	 * Listens on the window rather than wrapping the canvas: the table fills the
	 * viewport, the panes float over it, and a drop that lands on a pane should
	 * work the same as one on the felt. Card dragging is pointer-driven, so
	 * these HTML5 drag events never collide with it.
	 */
	import { isFileDrag } from './drop';

	let {
		onfile,
		hint = 'Drop a pack (.tbpp.json) or scenario (.tbps.json)'
	}: {
		onfile: (file: File) => void | Promise<void>;
		hint?: string;
	} = $props();

	let over = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * `dragover` repeats while the pointer moves, so a missed timer beat is the
	 * signal the drag left — more reliable than pairing `dragleave`, which also
	 * fires every time the cursor crosses between elements.
	 */
	function handleDragOver(event: DragEvent) {
		if (!isFileDrag(event)) return;
		// without preventDefault the browser opens the dropped file as a page
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		over = true;
		clearTimeout(timer);
		timer = setTimeout(() => (over = false), 200);
	}

	async function handleDrop(event: DragEvent) {
		if (!isFileDrag(event)) return;
		event.preventDefault();
		clearTimeout(timer);
		over = false;
		// sequentially: each file writes to the game store, and two packs racing
		// each other's updates is a worse outcome than waiting a tick
		for (const file of [...(event.dataTransfer?.files ?? [])]) await onfile(file);
	}

	$effect(() => () => clearTimeout(timer));
</script>

<svelte:window on:dragover={handleDragOver} on:drop={handleDrop} />

{#if over}
	<div
		class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
	>
		<div
			class="rounded-xl border-2 border-dashed border-white/60 px-8 py-6 text-center font-sans text-sm text-white uppercase"
		>
			{hint}
		</div>
	</div>
{/if}
