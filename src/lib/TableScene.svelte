<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import { World, Debug } from '@threlte/rapier';
	import { Grid, interactivity, OrbitControls } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { objectStore, updateCardState } from '$lib/store/objectStore.svelte';
	import type { CardState } from '$lib/store/objectStore.svelte';

	const isDragging = $derived($dragStore.isDragging !== null);
	let mesh: THREE.Mesh | undefined = $state();
	const { camera } = useThrelte();

	let intersectionPoint: THREE.Vector3 | null = $state(null);

	interactivity({
		compute: (event, state) => {
			if (!mesh) return;
			const intersects = state.raycaster.intersectObject(mesh);
			const [intersection] = intersects;
			intersectionPoint = intersection?.point ?? null;
			$dragStore.intersectionPoint = intersectionPoint;

			if (isDragging) {
				const { x, z } = $dragStore.intersectionPoint as THREE.Vector3;
				updateCardState($dragStore.isDragging as string, [x, 2.5, z]);
			}

			state.pointer.update((p) => {
				p.x = (event.clientX / window.innerWidth) * 2 - 1;
				p.y = -(event.clientY / window.innerHeight) * 2 + 1;
				return p;
			});

			// Update the raycaster
			state.raycaster.setFromCamera(state.pointer.current, $camera);
		}
	});

	// Add some test cards
	updateCardState('card1', [-2, 2.5, 0], 'https://card.cards.army/cards//beast_of_burden.webp');
	updateCardState('card2', [0, 4.5, 0], 'https://card.cards.army/cards//bosk_troll.webp');
	updateCardState('card3', [2, 6.5, 0], ' https://card.cards.army/cards//border_militia.webp');

	const cards = $derived(Object.entries($objectStore) as [string, CardState][]);
</script>

<T.PerspectiveCamera makeDefault position={[0, 30, 0]} rotation.x={-Math.PI / 2} fov={35}>
	<OrbitControls
		enableRotate={!isDragging}
		enableDamping
		maxPolarAngle={Math.PI / 2 - 0.1}
		target={[0, 0, 0]}
		minDistance={1}
		maxDistance={40}
	/>
</T.PerspectiveCamera>

<T.DirectionalLight position={[3, 10, 10]} intensity={3} />
<T.AmbientLight intensity={0.5} />

<World>
	{@render intersectionDot()}
	<Grid position.y={0.255} />
	<Table bind:mesh />
	{#each cards as [id]}
		<Card {id} />
	{/each}
</World>

{#snippet intersectionDot()}
	{#if !!intersectionPoint}
		<T.Mesh position={[intersectionPoint.x, intersectionPoint.y, intersectionPoint.z]}>
			<T.SphereGeometry args={[0.1, 32, 16]} />
			<T.MeshBasicMaterial color="#ff0000" depthTest={false} />
		</T.Mesh>
	{/if}
{/snippet}
