<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import { World } from '@threlte/rapier';
	import { HUD, interactivity } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { objectStore } from '$lib/store/objectStore.svelte';
	import type { CardState } from '$lib/store/objectStore.svelte';
	import TableCamera from './TableCamera.svelte';
	import Intersection from './Intersection.svelte';
	import HudTrayScene from '$lib/HUDTray/HUDTrayScene.svelte';
	import Deck from './Deck.svelte';
	import Hdr from './HDR.svelte';
	import HudPreviewScene from './HUDPreview/HUDPreviewScene.svelte';
	import { deckStore } from './store/deckStore.svelte';
	import { generateCardImages, getSorceryCardImage } from './utils/mock/cards';
	import { getStaticResourceUrl } from './utils/image';

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
				objectStore.updateCardState($dragStore.isDragging as string, [x, 2.5, z]);
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

	const init = [
		'beast_of_burden',
		'bosk_troll',
		'border_militia',
		'abundance-f',
		'vile_imp',
		'flame_wave'
	].map((card, index) => [
		`card:playername:${index + 1}`,
		[-6 + index * 2, 0, 0],
		`https://card.cards.army/cards/${card}.webp`
	]);

	const initCards = init;

	initCards.forEach(([id, position, faceImageUrl]) => {
		objectStore.updateCardState(
			id as string,
			position as [number, number, number],
			faceImageUrl as string,
			undefined,
			getStaticResourceUrl('/s-back.jpg')
		);
	});

	deckStore.updateDeck(`deck:playername:1`, {
		position: [8.25, 0.4, 3],
		cards: generateCardImages(30).map((slug, index) => ({
			id: `card:playername:${slug}-${index}`,
			faceImageUrl: getSorceryCardImage(slug),
			backImageUrl: getSorceryCardImage('/s-back.jpg')
		}))
	});

	deckStore.updateDeck(`deck:playername:2`, {
		isFaceUp: true,
		position: [10, 0.4, 3],
		cards: generateCardImages(30).map((slug, index) => ({
			id: `card:playername:${slug}-${index}`,
			faceImageUrl: getSorceryCardImage(slug),
			backImageUrl: getSorceryCardImage('/s-back.jpg')
		}))
	});

	const cards = $derived(Object.entries($objectStore) as [string, CardState][]);
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

	{#each Object.entries($deckStore) as [id] (id)}
		<Deck {id} />
	{/each}

	{#each cards as [id] (id)}
		<Card {id} />
	{/each}
</World>
