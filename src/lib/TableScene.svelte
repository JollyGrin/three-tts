<script lang="ts">
	import { T } from '@threlte/core';
	import { World } from '@threlte/rapier';
	import { Grid, OrbitControls } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { objectStore, updateCardState } from '$lib/store/objectStore.svelte';
	import type { CardState } from '$lib/store/objectStore.svelte';

	const isDragging = $derived(!!$dragStore.isDragging);

	// Add some test cards
	updateCardState('card1', [-2, 2.5, 0]);
	updateCardState('card2', [0, 4.5, 0]);
	updateCardState('card3', [2, 6.5, 0]);

	const cards = $derived(Object.entries($objectStore) as [string, CardState][]);
</script>

<T.PerspectiveCamera makeDefault position={[0, 20, 10]} fov={30}>
	<OrbitControls enableRotate={!isDragging} enableDamping maxPolarAngle={Math.PI / 2 - 0.1} />
</T.PerspectiveCamera>

<T.DirectionalLight position={[3, 10, 10]} intensity={1.5} />
<T.AmbientLight intensity={0.5} />

<World>
	<Grid position.y={0.26} />
	<Table />
	<!-- Add some test cards -->
	{#each cards as [id]}
		<Card {id} />
	{/each}
</World>
