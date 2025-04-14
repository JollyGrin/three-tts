<script lang="ts">
	import { T } from '@threlte/core';
	import { dragStore, setTrayHover } from '$lib/store/dragStore.svelte';
	import * as THREE from 'three';
	import { useViewport, interactivity } from '@threlte/extras';
	import TrayCard from './TrayCard.svelte';
	import type { GameDTO } from '$lib/store/game/types';
	import { gameActions } from '$lib/store/game/actions';
	import { gameStore } from '$lib/store/game/gameStore.svelte';

	interactivity();
	let {}: {} = $props();

	const viewport = useViewport();

	const trayWidth = $derived($viewport.width / 2);
	const trayHeight = $derived($viewport.height / 6); // Adjust height as needed
	const trayX = $derived(-$viewport.width / 2 + trayWidth / 2);
	const trayY = $derived(-$viewport.height / 2 + trayHeight / 2);

	let trayMesh: THREE.Mesh | undefined = $state(undefined);

	const myPlayerId = $derived(gameActions?.getMe()?.id ?? '');
	const cards = $derived(
		Object.entries($gameStore?.players?.[myPlayerId]?.tray ?? {}) as [
			string,
			GameDTO['cards'][string]
		][]
	);
</script>

<T.OrthographicCamera makeDefault zoom={80} position={[0, 0, 10]} />
<T.AmbientLight intensity={Math.PI / 2} />
<T.PointLight position={[10, 10, 10]} decay={0} intensity={Math.PI * 2} />

<T.Group position={[trayX, trayY, 0] as [number, number, number]}>
	<T.Mesh
		bind:ref={trayMesh}
		onpointerenter={() => setTrayHover(true)}
		onpointerleave={() => setTrayHover(false)}
	>
		<T.PlaneGeometry args={[trayWidth, trayHeight]} />
		<T.MeshBasicMaterial
			color="white"
			transparent
			opacity={$dragStore.isTrayHovered ? 0.3 : 0.1}
			side={2}
		/>
	</T.Mesh>

	{#each cards as [id], index (id)}
		<TrayCard {id} {index} {trayWidth} />
	{/each}
</T.Group>
