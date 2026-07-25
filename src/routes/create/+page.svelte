<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { ACESFilmicToneMapping } from 'three';
	import TableScene from '$lib/TableScene.svelte';
	import { cameraTransforms } from '$lib/utils/transforms/camera';
	import { onMount } from 'svelte';
	import { gameActions } from '$lib/store/game/actions';
	import { disconnect } from '$lib/websocket/connection';
	import CreatePane from './CreatePane.svelte';

	function handleKeyDown(event: KeyboardEvent) {
		if (event.code === 'KeyC') cameraTransforms.resetView();
	}

	let isReady = $state(false);
	onMount(() => {
		// hard-local editor: kill any live socket from a previous /play visit so
		// authoring a pack never broadcasts into a lobby
		disconnect();
		if (!gameActions.getMe()) gameActions.addPlayer();
		isReady = true;
	});
</script>

<svelte:head>
	<title>pack editor — table.place</title>
	<meta name="description" content="Author a table.place game pack (.tbpp.json) locally" />
</svelte:head>

<svelte:window on:keydown={handleKeyDown} />

<CreatePane />

<div class="h-screen w-screen overflow-clip bg-gray-700">
	<Canvas toneMapping={ACESFilmicToneMapping}>
		{#if isReady}
			<TableScene />
		{/if}
	</Canvas>
</div>
