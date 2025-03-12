<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TableScene from '$lib/TableScene.svelte';
	import { objectStore, updateCardState } from '$lib/store/objectStore.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';

	function flipCard() {
		const id = $dragStore.isHovered || $dragStore.isDragging;
		if (!id) return;

		const card = $objectStore[id as string];
		const [x, y, z] = card.rotation;
		const isFlipped = card.rotation[0] === 180;
		updateCardState(id as string, card.position, card.faceImageUrl, [isFlipped ? 0 : 180, y, z]);
	}

	function tapCard() {
		const id = $dragStore.isHovered || $dragStore.isDragging;
		if (!id) return;

		const card = $objectStore[id as string];
		const [x, y, z] = card.rotation;
		const isTapped = card.rotation[2] === 90;
		updateCardState(id as string, card.position, card.faceImageUrl, [x, y, isTapped ? 0 : 90]);
	}

	function handleKeyDown(event: KeyboardEvent) {
		const id = $dragStore.isHovered || $dragStore.isDragging;
		if (id) event.preventDefault();

		if (event.code === 'KeyF') flipCard();
		if (event.code === 'KeyT') tapCard();
	}

	function handleKeyUp(event: KeyboardEvent) {
		const id = $dragStore.isHovered || $dragStore.isDragging;
		console.log($objectStore[id as string]);
		if (event.code !== 'Space') return;
	}
</script>

<svelte:window on:keydown|preventDefault={handleKeyDown} on:keyup|preventDefault={handleKeyUp} />

<div
	class="fixed top-1 right-1 z-50 flex w-fit scale-80 gap-1 rounded bg-gray-50/10 px-2 py-[2px] opacity-30 md:top-4 md:right-4 md:scale-100"
>
	<button onclick={flipCard}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> f </span>
		<span class="text-white"> Flip card </span>
	</button>
</div>

<div class="h-screen w-screen overflow-clip">
	<Canvas>
		<TableScene />
	</Canvas>
</div>
