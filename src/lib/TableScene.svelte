<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import { World } from '@threlte/rapier';
	import { HUD, interactivity } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
	import TableCamera from './TableCamera.svelte';
	import Intersection from './Intersection.svelte';
	import HudTrayScene from '$lib/HUDTray/HUDTrayScene.svelte';
	import Deck from './Deck.svelte';
	import Hdr from './HDR.svelte';
	import HudPreviewScene from './HUDPreview/HUDPreviewScene.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { gameStore } from './store/game/gameStore.svelte';
	import type { GameDTO } from './store/game/types';
	import { page } from '$app/state';
	type CardDTO = GameDTO['cards'][string];

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
				const cardId = $dragStore.isDragging as string;
				gameStore.updateState({ cards: { [cardId]: { position: [x, 2.5, z] } } });
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

	const cards = $derived(Object.entries($gameStore?.cards ?? {}) as [string, CardDTO][]);
	const isUnmatched = $derived(page.url.toString()?.split('/').includes('unmatched'));
</script>

<TableCamera />
<T.PointLight position={[0, 20, 0]} intensity={500} scale={1} castShadow />

<HUD>
	<HudTrayScene />
</HUD>

<HUD>
	<HudPreviewScene />
</HUD>

<World>
	<Hdr />
	<Intersection />
	<Table bind:mesh />

	{#each Object.entries($gameStore?.decks ?? {}) as [id] (id)}
		<Deck {id} />
	{/each}

	{#each cards as [id] (id)}
		<Card {id} {isUnmatched} />
	{/each}
</World>
