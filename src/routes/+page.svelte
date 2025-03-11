<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TableScene from '$lib/TableScene.svelte';
	import { objectStore } from '$lib/store/objectStore.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';

	function handleKeyDown(event: KeyboardEvent) {
		const id = $dragStore.isHovered || $dragStore.isDragging;
		if (!id) return event.preventDefault();

		const card = $objectStore[id as string];
		if (event.code === 'KeyF') {
			card.rotation = [180, 0, 0];
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		const id = $dragStore.isHovered || $dragStore.isDragging;
		console.log($objectStore[id as string]);
		if (event.code !== 'Space') return;
	}
</script>

<svelte:window on:keydown|preventDefault={handleKeyDown} on:keyup|preventDefault={handleKeyUp} />

<div class="h-screen w-screen">
	<Canvas>
		<TableScene />
	</Canvas>
</div>
