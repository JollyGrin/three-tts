<script lang="ts">
	import { T } from '@threlte/core';
	import { World } from '@threlte/rapier';
	import { OrbitControls } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { objectStore } from '$lib/store/objectStore.svelte';

	const isDragging = $derived(!!$dragStore.isDragging);
	$inspect(isDragging);

	const cards = $derived(Object.entries($objectStore));
</script>

<T.PerspectiveCamera makeDefault position={[0, 10, 10]} fov={50}>
	<OrbitControls enableRotate={!isDragging} enableDamping maxPolarAngle={Math.PI / 2 - 0.1} />
</T.PerspectiveCamera>

<T.DirectionalLight position={[3, 10, 10]} intensity={1.5} />
<T.AmbientLight intensity={0.5} />

<World>
	<Table />
	<!-- Add some test cards -->
	{#each cards as [id, { position, rotation }]}
		<Card {position} {id} />
	{/each}
</World>
