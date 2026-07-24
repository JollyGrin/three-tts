<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { ACESFilmicToneMapping } from 'three';
	import TableScene from '$lib/TableScene.svelte';
	import { cameraTransforms } from '$lib/utils/transforms/camera';
	import { onMount } from 'svelte';
	import { initWrappers } from '$lib/websocket/storeIntegration';
	import { initWebsocket } from '$lib/websocket';
	import { gameActions } from '$lib/store/game/actions';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { claimSeat, seatPlaceholderId, type SeatIndex } from '$lib/scenario/scenario';
	import Pane from './Pane.svelte';
	import { page } from '$app/state';
	import PaneDecks from './PaneDecks.svelte';
	import toast from 'svelte-french-toast';

	function handleKeyDown(event: KeyboardEvent) {
		if (event.code === 'Space') cameraTransforms.togglePreviewHud(true);
		if (event.code === 'KeyF') gameActions.flipCard();
		if (event.code === 'KeyC') cameraTransforms.resetView();
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

	// ?seat=N invite links: once the sync delivers a scenario with that seat's
	// placeholder still open, claim it automatically for the joining player
	function autoClaimSeat(seatParam: string | null) {
		const seat = Number(seatParam) as SeatIndex;
		if (seatParam === null || ![0, 1, 2, 3].includes(seat)) return;
		let claimed = false;
		const stop = gameStore.subscribe((s) => {
			if (claimed || !s?.players?.[seatPlaceholderId(seat)]) return;
			claimed = true;
			// claim outside the store notification cycle
			queueMicrotask(() => {
				if (claimSeat(seat)) toast(`Seat ${seat} claimed — your decks are ready`);
				stop();
			});
		});
		// stop waiting if no scenario ever shows up
		setTimeout(() => stop(), 20000);
	}

	onMount(() => {
		const lobbyId = page?.url?.searchParams?.get('lobby') ?? undefined;
		const serverUrl = page?.url?.searchParams?.get('server') ?? undefined;
		const seatParam = page?.url?.searchParams?.get('seat');
		const connected = initWebsocket(lobbyId, serverUrl);
		connected.then((res) => {
			isConnected = res;
			if (res) autoClaimSeat(seatParam);
		});
	});
</script>

<svelte:head>
	<title>table.place</title>
	<meta name="description" content="A browser-based tabletop simulator" />
</svelte:head>

<svelte:window on:keydown={handleKeyDown} on:keyup|preventDefault={handleKeyUp} />

<Pane />
<PaneDecks />

<div
	class="h-screen w-screen overflow-clip transition-all"
	class:bg-gray-800={!isConnected}
	class:bg-gray-700={isConnected}
>
	<!-- threlte 8.5 changed the default to AgX, which desaturates the felt to gray -->
	<Canvas toneMapping={ACESFilmicToneMapping}>
		{#if isConnected}
			<TableScene />
		{/if}
	</Canvas>
</div>
