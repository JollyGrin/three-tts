<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { ACESFilmicToneMapping } from 'three';
	import TableScene from '$lib/TableScene.svelte';
	import { cameraTransforms } from '$lib/utils/transforms/camera';
	import { onMount } from 'svelte';
	import { gameActions } from '$lib/store/game/actions';
	import { disconnect } from '$lib/websocket/connection';
	import CreatePane from './CreatePane.svelte';

	/**
	 * Authoring is mostly typing — codes, names, image URLs — and the editor's
	 * gestures are bare letters. A key that lands in a pane field is text, not
	 * a table command.
	 */
	function isTyping(target: EventTarget | null) {
		const element = target as HTMLElement | null;
		if (!element) return false;
		return (
			element.tagName === 'INPUT' ||
			element.tagName === 'TEXTAREA' ||
			element.tagName === 'SELECT' ||
			element.isContentEditable
		);
	}

	// same gestures as /setup, so a card pulled out of a preview pile can be
	// inspected (flip) and arranged without leaving the editor
	function handleKeyDown(event: KeyboardEvent) {
		if (isTyping(event.target)) return;
		if (event.code === 'Space') cameraTransforms.togglePreviewHud(true);
		if (event.code === 'KeyF') gameActions.flipCard();
		if (event.code === 'KeyC') cameraTransforms.resetView();
		if (event.code === 'KeyT') gameActions.tapCard();
		if (event.code === 'KeyR') gameActions.tapCard(true);
		if (event.code === 'ArrowUp') gameActions.incrementHeight(0.01);
		if (event.code === 'ArrowDown') gameActions.incrementHeight(-0.01);
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (isTyping(event.target)) return;
		if (event.code === 'Space') cameraTransforms.togglePreviewHud(false);
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

<svelte:window on:keydown={handleKeyDown} on:keyup|preventDefault={handleKeyUp} />

<CreatePane />

<div class="h-screen w-screen overflow-clip bg-gray-700">
	<Canvas toneMapping={ACESFilmicToneMapping}>
		{#if isReady}
			<!-- no hand in the pack editor: a card dropped into the tray lands in
			     state no pack can represent, and survives every preview respawn -->
			<TableScene hand={false} />
		{/if}
	</Canvas>
</div>
