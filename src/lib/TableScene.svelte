<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import { World } from '@threlte/rapier';
	import { Grid, ImageMaterial, interactivity, OrbitControls } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { objectStore, updateCardState } from '$lib/store/objectStore.svelte';
	import type { CardState } from '$lib/store/objectStore.svelte';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import TableCamera from './TableCamera.svelte';

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
				const { x, z } = intersectionPoint as THREE.Vector3;
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

<TableCamera />
<T.PointLight position={[0, 20, 0]} intensity={500} scale={1} castShadow />

<World>
	{@render intersectionDot()}
	<Table bind:mesh />

	{#each cards as [id]}
		<Card {id} />
	{/each}
</World>

{#snippet intersectionDot()}
	{#if !!intersectionPoint}
		<T.Mesh position={[intersectionPoint.x, intersectionPoint.y, intersectionPoint.z]}>
			{#if $dragStore.isDragging}
				{@const card = $objectStore[$dragStore.isDragging]}
				<T.Mesh
					position.y={0.01}
					rotation.x={-Math.PI / 2}
					rotation.z={-card.rotation[2] * DEG2RAD}
				>
					<T.PlaneGeometry args={[1.4, 2]} />
					<ImageMaterial
						url={card?.faceImageUrl}
						side={0}
						radius={0.1}
						transparent={true}
						opacity={0.2}
					/>
				</T.Mesh>
			{/if}
			<T.SphereGeometry args={[0.1, 32, 16]} />
			<T.MeshBasicMaterial color="#ff0000" depthTest={false} />
		</T.Mesh>
	{/if}
{/snippet}
