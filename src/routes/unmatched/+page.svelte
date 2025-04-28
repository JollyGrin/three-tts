<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TableScene from '$lib/TableScene.svelte';
	import { cameraTransforms } from '$lib/utils/transforms/camera';
	import { onMount } from 'svelte';
	import { initWrappers } from '$lib/websocket/storeIntegration';
	import { initWebsocket } from '$lib/websocket';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { gameActions } from '$lib/store/game/actions';
	import Pane from './Pane.svelte';
	import { OVERLAY_UNMATCHED_DEFAULT } from './constants';
	import { page } from '$app/state';

	function handleKeyDown(event: KeyboardEvent) {
		// if (!isConnectionModalOpen) event.preventDefault();
		// console.log('KEY', event.code);
		if (event.code === 'Space') cameraTransforms.togglePreviewHud(true);
		if (event.code === 'KeyF') gameActions.flipCard();
		if (event.code === 'KeyT') gameActions.tapCard();
		if (event.code === 'KeyR') gameActions.tapCard(true);
		if (event.code === 'ArrowUp') gameActions.incrementHeight(0.01);
		if (event.code === 'ArrowDown') gameActions.incrementHeight(-0.01);
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.code === 'Space') cameraTransforms.togglePreviewHud(false);
	}

	initWrappers();
	let isConnected = $state(false);
	onMount(() => {
		const lobbyId = page?.url?.searchParams?.get('lobby') ?? undefined;
		const serverUrl = page?.url?.searchParams?.get('server') ?? undefined;
		const connected = initWebsocket(lobbyId, serverUrl);
		connected.then((res) => {
			isConnected = res;
			// Add playmat overlay on table
			if (!$gameStore?.overlays?.unmatched?.imageUrl)
				gameStore.updateState({
					overlays: OVERLAY_UNMATCHED_DEFAULT,
					cards: {
						mockcard: {
							position: [0, 0.5, 0],
							faceImageUrl: 'https://picsum.photos/400'
						}
					}
				});
		});
	});
</script>

<svelte:head>
	<title>Unmatched: lobbyid</title>
	<meta name="description" content="Tabletop Simulator but in the browser" />
</svelte:head>

<svelte:window on:keydown={handleKeyDown} on:keyup|preventDefault={handleKeyUp} />

<Pane />

<div
	class="h-screen w-screen overflow-clip transition-all"
	class:bg-gray-800={!isConnected}
	class:bg-gray-700={isConnected}
>
	<Canvas>
		{#if isConnected}
			<TableScene />
		{/if}
	</Canvas>
</div>
