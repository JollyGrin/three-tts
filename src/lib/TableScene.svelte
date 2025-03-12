<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import { World } from '@threlte/rapier';
	import { HUD, interactivity } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { objectStore, updateCardState } from '$lib/store/objectStore.svelte';
	import type { CardState } from '$lib/store/objectStore.svelte';
	import TableCamera from './TableCamera.svelte';
	import Intersection from './Intersection.svelte';
	import HudHandScene from './HUDHandScene.svelte';

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

<HUD>
	<HudHandScene />
</HUD>

<World>
	<Intersection />
	<Table bind:mesh />

	{#each cards as [id]}
		<Card {id} />
	{/each}
</World>
