<script lang="ts">
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import {
		Button,
		Pane,
		Point,
		Wheel,
		Text,
		AutoValue,
		Folder,
		Element,
		FpsGraph
	} from 'svelte-tweakpane-ui';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { OVERLAY_SORCERY_DEFAULT } from './constants';
	import { purgeUndefinedValues } from '$lib/utils/transforms/data';
	import type { GameDTO } from '$lib/store/game/types';
	import { gameActions } from '$lib/store/game/actions';
	import { connectionStore } from '$lib/store/connectionStore.svelte';
	import { page } from '$app/state';

	async function fetchDeck() {
		const response = await fetch(
			'https://corsproxy.innkeeper1.workers.dev/?url=https://curiosa.io/api/decks/clso3lngx007lhb600v843gd7'
		);
		const data = await response.json();
		console.log('res deck:', response, data);
	}

	function resetOverlayToDefault() {
		gameStore.updateState({ overlays: OVERLAY_SORCERY_DEFAULT });
	}

	let rot = $state(0);
	let scale = $state($gameStore?.overlays?.sorcery?.scale ?? 0.015 * 100);
	let point3d = $state({ x: 0, y: 0 });
	let imageUrl = $state($gameStore?.overlays?.sorcery?.imageUrl ?? '');

	$effect(() => {
		const _imageUrl = imageUrl === '' ? undefined : imageUrl;
		gameStore.updateState({
			overlays: {
				sorcery: purgeUndefinedValues({
					imageUrl: _imageUrl,
					rotation: [0, rot * DEG2RAD, 0],
					position: [point3d.x, 0.255, point3d.y],
					scale: scale / 100
				}) as NonNullable<GameDTO['overlays']>[string]
			}
		});
	});

	let lobbyId = $state(page.url.searchParams.get('lobby') ?? '');
	$effect(() => {
		page.url.searchParams.set('lobby', lobbyId);
	});
</script>

<Pane position="draggable" title="Settings" expanded={true} y={0} x={0}>
	<FpsGraph />
	<Folder title="Connection" expanded={false}>
		<Text label="My ID" value={localStorage.getItem('myPlayerId') ?? ''} disabled />
		<Text label="Server:" bind:value={$connectionStore.serverUrl} />
		<Text label="Lobby:" bind:value={lobbyId} />
	</Folder>
	<Folder title="Overlays" expanded={false}>
		<Button title="Reset to default" on:click={resetOverlayToDefault} />
		<Text label="Image URL" bind:value={imageUrl}></Text>
		<Point bind:value={point3d} label="Position" />
		<AutoValue label="Scale" bind:value={scale} />
		<Wheel label="Rotation" bind:value={rot} format={(v) => `${(Math.abs(v) % 360).toFixed(0)}°`} />
	</Folder>
	<Folder title="Load Deck">
		<Element>
			<div class="font-sans text-xs text-white uppercase opacity-30">
				<span class="animate-pulse"> Load a url from Curiosa </span>
			</div>
		</Element>
		<Text label="Deck URL" value="" />
		<Button
			title="Load Deck"
			on:click={() => {
				fetchDeck();
				gameActions.initDeck({
					isFaceUp: false
				});

				gameActions.initDeck({
					isFaceUp: true
				});
			}}
		/>
	</Folder>
	<Folder title="Keybinds">
		<Button
			on:click={() => gameActions?.setSeat()}
			label="Seat: {$gameStore?.players?.[gameActions?.getMe()?.id ?? 0]?.seat}"
			title="Next Seat"
		/>
		<Text label="Preview hovered" value="spacebar" disabled />
		<Text label="Tap card" value="T" disabled />
		<Text label="Reverse Tap card" value="R" disabled />
		<Text label="Flip card" value="F" disabled />
	</Folder>
</Pane>
