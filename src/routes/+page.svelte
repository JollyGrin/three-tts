<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TableScene from '$lib/TableScene.svelte';
	import { cardTransforms } from '$lib/utils/transforms/card';

	function handleKeyDown(event: KeyboardEvent) {
		if (event.code === 'KeyF') cardTransforms.flip();
		if (event.code === 'KeyT') cardTransforms.tap();
	}

	function handleKeyUp(event: KeyboardEvent) {}
</script>

<svelte:window on:keydown|preventDefault={handleKeyDown} on:keyup|preventDefault={handleKeyUp} />

<div
	class="fixed top-1 right-1 z-50 flex w-fit scale-80 gap-4 rounded bg-gray-50/10 px-2 py-[2px] text-xs opacity-30 md:top-4 md:right-4 md:scale-100"
>
	<button onclick={cardTransforms.flip}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> f </span>
		<span class="text-white"> Flip card </span>
	</button>

	<button onclick={cardTransforms.tap}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> t </span>
		<span class="text-white"> Tap card </span>
	</button>
</div>

<div class="h-screen w-screen overflow-clip">
	<Canvas>
		<TableScene />
	</Canvas>
</div>
