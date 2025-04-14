<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TableScene from '$lib/TableScene.svelte';
	import { cameraTransforms } from '$lib/utils/transforms/camera';
	import { onMount } from 'svelte';
	import { initWrappers } from '$lib/websocket/storeIntegration';
	import { initWebsocket } from '$lib/websocket';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { gameActions } from '$lib/store/game/actions';

	$inspect('cards:', $gameStore?.cards);
	$inspect('players:', $gameStore?.players);
	$inspect('decks:', $gameStore?.decks);

	function handleKeyDown(event: KeyboardEvent) {
		if (event.code === 'Space') cameraTransforms.togglePreviewHud(true);
		if (event.code === 'KeyF') gameActions.flipCard();
		if (event.code === 'KeyT') gameActions.tapCard();
		if (event.code === 'KeyR') gameActions.tapCard(true);
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.code === 'Space') cameraTransforms.togglePreviewHud(false);
	}

	initWrappers();

	onMount(() => {
		if (gameActions.getMe() === undefined) return gameActions.addPlayer(); // generate new player with random id and assign as me
		initWebsocket();
	});

	const showInitDeck = $derived(gameActions.getMyDecks().length === 0);

	// async function fetchDeck() {
	// 	const response = await fetch(
	// 		'https://corsproxy.innkeeper1.workers.dev/?url=https://curiosa.io/api/decks/clso3lngx007lhb600v843gd7'
	// 	);
	// 	const data = await response.json();
	// 	console.log('res deck:', response, data);
	// }
</script>

<svelte:head>
	<title>TableTop Browser</title>
	<meta name="description" content="Tabletop Simulator but in the browser" />
</svelte:head>

<svelte:window on:keydown|preventDefault={handleKeyDown} on:keyup|preventDefault={handleKeyUp} />

<div
	class="fixed top-1 right-1 z-50 flex w-fit scale-80 gap-4 rounded bg-gray-50/10 px-2 py-[2px] text-xs opacity-30 md:top-4 md:right-4 md:scale-100"
>
	<button onclick={() => gameActions.setSeat()}>
		<span class="bg-gray-400 px-2"
			>{$gameStore?.players?.[gameActions?.getMe()?.id ?? 0]?.seat}</span
		>
		<span class="text-white"> Next Seat </span>
	</button>

	<button onclick={cameraTransforms.resetView}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2 text-gray-400">
			spacebar
		</span>
		<span class="text-white"> Preview hovered card </span>
	</button>

	<button onclick={() => gameActions.flipCard()}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> f </span>
		<span class="text-white"> Flip card </span>
	</button>

	<button onclick={() => gameActions.tapCard()}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> t </span>
		<span class="text-white"> Tap card </span>
	</button>

	<button onclick={() => gameActions?.tapCard(true)}>
		<span class="rounded border-b-[2px] border-b-gray-700 bg-gray-200 px-2"> r </span>
		<span class="text-white"> Reverse Tap card </span>
	</button>
</div>

<!-- <div class="fixed right-1 bottom-1 z-50 flex w-fit rounded bg-white p-2"> -->
<!-- 	<input /> -->
<!-- 	<button onclick={fetchDeck}>init deck</button> -->
<!-- </div> -->

{#if true && showInitDeck}
	<button
		class="fixed right-1 bottom-6 z-50 flex w-fit rounded bg-white p-2"
		onclick={() => {
			gameActions.initDeck({
				isFaceUp: false
			});

			gameActions.initDeck({
				isFaceUp: true
			});
		}}>init deck</button
	>
{/if}

<div class="h-screen w-screen overflow-clip">
	<Canvas>
		<TableScene />
	</Canvas>
</div>
