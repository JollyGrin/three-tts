<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TableScene from '$lib/TableScene.svelte';
	import { objectStore, updateCardState } from '$lib/store/objectStore.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { flipCard } from '$lib/utils/transforms/card';

	function tapCard() {
		const id = $dragStore.isHovered || $dragStore.isDragging;
		if (!id) return;

		const card = $objectStore[id as string];
		const [x, y, _z] = card.rotation;
		const isTapped = card.rotation[2] === 90;
		updateCardState(id as string, card.position, card.faceImageUrl, [x, y, isTapped ? 0 : 90]);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.code === 'KeyF') flipCard();
		if (event.code === 'KeyT') tapCard();
	}

	function handleKeyUp(event: KeyboardEvent) {}
</script>

<svelte:window on:keydown|preventDefault={handleKeyDown} on:keyup|preventDefault={handleKeyUp} />

<div
	class="fixed top-1 right-1 z-50 flex w-fit scale-80 gap-4 rounded bg-gray-50/10 px-2 py-[2px] text-xs opacity-30 md:top-4 md:right-4 md:scale-100"
>
	<button onclick={flipCard}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> f </span>
		<span class="text-white"> Flip card </span>
	</button>

	<button onclick={tapCard}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> t </span>
		<span class="text-white"> Tap card </span>
	</button>
</div>

<div class="h-screen w-screen overflow-clip">
	<Canvas>
		<TableScene />
	</Canvas>
</div>
