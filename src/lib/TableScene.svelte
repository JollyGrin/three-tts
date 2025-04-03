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
	import { playerId } from './websocket';
	import { get } from 'svelte/store';

	const isDragging = $derived($dragStore.isDragging !== null);
	let mesh: THREE.Mesh | undefined = $state();
	const { camera } = useThrelte();

	let intersectionPoint: THREE.Vector3 | null = $state(null);
	
	// Debounce variables to limit card position updates
	let lastUpdateTime = 0;
	const MIN_UPDATE_INTERVAL = 150; // ms between updates - aggressive debounce
	let pendingUpdate: { id: string, position: [number, number, number] } | null = null;
	
	// Track which cards we're currently updating to prevent conflicts
	const cardUpdateLock = new Set<string>();

	interactivity({
		compute: (event, state) => {
			if (!mesh) return;
			const intersects = state.raycaster.intersectObject(mesh);
			const [intersection] = intersects;
			intersectionPoint = intersection?.point ?? null;
			$dragStore.intersectionPoint = intersectionPoint;

			if (isDragging) {
				const { x, z } = intersectionPoint as THREE.Vector3;
				
				// Get the card being dragged
				const cardId = $dragStore.isDragging as string;
				
				// Get the current time
				const now = Date.now();
				
				// Skip update if we're not allowed to update this card yet
				// or if another instance is already processing updates for this card
				if (cardUpdateLock.has(cardId)) {
					return;
				}
				
				// Check if card is owned by another player
				const cardState = objectStore.getCardState(cardId);
				const currentPlayerId = get(playerId);
				
				if (cardState?.lastTouchedBy && 
					cardState.lastTouchedBy !== currentPlayerId && 
					(now - (cardState.lastTouchTime || 0)) < 2000) {
					// Card is being controlled by another player - don't update position
					console.log(`Card ${cardId} is locked by ${cardState.lastTouchedBy}, not updating position`);
					return;
				}
				
				// Apply aggressive debounce - store pending update
				pendingUpdate = {
					id: cardId,
					position: [x, 2.5, z]
				};
				
				// If we haven't sent an update recently, send one immediately
				if (now - lastUpdateTime >= MIN_UPDATE_INTERVAL) {
					applyPendingUpdate();
				} else {
					// Otherwise schedule an update after the debounce period
					if (!cardUpdateLock.has(cardId)) {
						cardUpdateLock.add(cardId);
						setTimeout(() => {
							applyPendingUpdate();
							cardUpdateLock.delete(cardId);
						}, MIN_UPDATE_INTERVAL - (now - lastUpdateTime));
					}
				}
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
	
	// Function to apply the pending update
	function applyPendingUpdate() {
		if (pendingUpdate) {
			// Apply the update
			objectStore.updateCardState(
				pendingUpdate.id, 
				pendingUpdate.position
			);
			
			// Update the timestamp
			lastUpdateTime = Date.now();
			pendingUpdate = null;
		}
	}

	// Get the current player's ID for private player objects
	const currentPlayerId = get(playerId);

	// Initial cards - using globally consistent IDs without player ID
	const init = [
		'beast_of_burden',
		'bosk_troll',
		'border_militia',
		'abundance-f',
		'vile_imp',
		'flame_wave'
	].map((card, index) => [
		`card:global:${index + 1}`, // Global consistent ID for shared objects
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

	// Player-specific decks - use player ID for private objects
	deckStore.updateDeck(`deck:${currentPlayerId}:1`, {
		position: [8.25, 0.4, 3],
		cards: generateCardImages(30).map((slug, index) => ({
			id: `card:${currentPlayerId}:${slug}-${index}`, // Player-specific cards (in hand)
			faceImageUrl: getSorceryCardImage(slug),
			backImageUrl: getStaticResourceUrl('/s-back.jpg')
		}))
	});

	// Shared deck (using global ID)
	deckStore.updateDeck(`deck:global:2`, {
		isFaceUp: true,
		position: [10, 0.4, 3],
		cards: generateCardImages(30).map((slug, index) => ({
			id: `card:global:${slug}-${index}`, // Global IDs for shared objects
			faceImageUrl: getSorceryCardImage(slug),
			backImageUrl: getStaticResourceUrl('/s-back.jpg')
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
