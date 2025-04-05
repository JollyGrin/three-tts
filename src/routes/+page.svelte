<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TableScene from '$lib/TableScene.svelte';
	import { cardTransforms } from '$lib/utils/transforms/card';
	import { seatStore, setSeat } from '$lib/store/seatStore.svelte';
	import { playerStore } from '$lib/store/playerStore.svelte';
	import { cameraTransforms } from '$lib/utils/transforms/camera';

	function handleKeyDown(event: KeyboardEvent) {
		if (event.code === 'Space') cameraTransforms.togglePreviewHud(true);
		if (event.code === 'KeyF') cardTransforms.flip();
		if (event.code === 'KeyT') cardTransforms.tap();
		if (event.code === 'KeyR') cardTransforms.tap(true);
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.code === 'Space') cameraTransforms.togglePreviewHud(false);
	}

	const showInitDeck = $derived(playerStore.getMe()?.deckIds.length === 0);

	$inspect('xxxxx', playerStore.getMe()?.deckIds);
</script>

<svelte:head>
	<title>TableTop Browser</title>
	<meta name="description" content="Tabletop Simulator but in the browser" />
</svelte:head>

<svelte:window on:keydown|preventDefault={handleKeyDown} on:keyup|preventDefault={handleKeyUp} />

<div
	class="fixed top-1 right-1 z-50 flex w-fit scale-80 gap-4 rounded bg-gray-50/10 px-2 py-[2px] text-xs opacity-30 md:top-4 md:right-4 md:scale-100"
>
	<button onclick={() => setSeat()}>
		<span class="bg-gray-400 px-2">{$seatStore.seat}</span>
		<span class="text-white"> Next Seat </span>
	</button>

	<button onclick={cameraTransforms.resetView}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2 text-gray-400">
			spacebar
		</span>
		<span class="text-white"> Preview hovered card </span>
	</button>

	<button onclick={cardTransforms.flip}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> f </span>
		<span class="text-white"> Flip card </span>
	</button>

	<button onclick={() => cardTransforms.tap()}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> t </span>
		<span class="text-white"> Tap card </span>
	</button>

	<button onclick={() => cardTransforms.tap(true)}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> r </span>
		<span class="text-white"> Reverse Tap card </span>
	</button>
</div>

{#if showInitDeck}
	<button class="fixed right-1 bottom-1 z-50 flex w-fit rounded bg-white p-2">init deck</button>
{/if}

<div class="h-screen w-screen overflow-clip">
	<Canvas>
		<TableScene />
	</Canvas>
</div>
