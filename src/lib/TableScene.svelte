<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import { HUD, interactivity } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
	import TableCamera from './TableCamera.svelte';
	import DropIndicator from './drop/DropIndicator.svelte';
	import HudTrayScene from '$lib/HUDTray/HUDTrayScene.svelte';
	import Deck from './Deck.svelte';
	import Piece from './Piece.svelte';
	import Hdr from './HDR.svelte';
	import HudPreviewScene from './HUDPreview/HUDPreviewScene.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { gameStore } from './store/game/gameStore.svelte';
	import { clampToTable } from './utils/transforms/drop';
	import { CARD_DRAG_Y } from '$lib/utils/constants-cards';
	import { PIECE_DRAG_Y } from '$lib/utils/constants-pieces';
	import { TABLE_TOP_Y } from '$lib/utils/constants-table';
	import type { GameDTO } from './store/game/types';
	type CardDTO = GameDTO['cards'][string];

	const isDragging = $derived($dragStore.isDragging !== null);
	let mesh: THREE.Mesh | undefined = $state();
	const { camera } = useThrelte();

	let intersectionPoint: THREE.Vector3 | null = $state(null);

	// fallback for when the pointer leaves the table mesh: the infinite plane at
	// tabletop height keeps a drag tracking instead of yielding a null hit
	const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_TOP_Y);
	const planeHit = new THREE.Vector3();

	interactivity({
		compute: (event, state) => {
			if (!mesh) return;
			const intersects = state.raycaster.intersectObject(mesh);
			const [intersection] = intersects;
			intersectionPoint =
				intersection?.point ??
				(state.raycaster.ray.intersectPlane(tablePlane, planeHit) ? planeHit.clone() : null);
			$dragStore.intersectionPoint = intersectionPoint ?? undefined;

			if (isDragging && intersectionPoint) {
				// same clamp the drop commits with (see utils/transforms/drop.ts),
				// so the floating entity can never track somewhere it can't land
				const [cx, cz] = clampToTable(intersectionPoint.x, intersectionPoint.z);
				const dragId = $dragStore.isDragging as string;
				if (dragId.startsWith('piece:')) {
					gameStore.updateState({ pieces: { [dragId]: { position: [cx, PIECE_DRAG_Y, cz] } } });
				} else {
					gameStore.updateState({ cards: { [dragId]: { position: [cx, CARD_DRAG_Y, cz] } } });
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

	const cards = $derived(Object.entries($gameStore?.cards ?? {}) as [string, CardDTO][]);
</script>

<TableCamera />
<T.PointLight position={[0, 20, 0]} intensity={500} scale={1} castShadow />
<!-- soft fill so vertical faces (card edges, deck sides) aren't pitch black -->
<T.AmbientLight intensity={0.5} />

<HUD>
	<HudTrayScene />
</HUD>

<HUD>
	<HudPreviewScene />
</HUD>

<Hdr />
<DropIndicator />
<Table bind:mesh />

{#each Object.entries($gameStore?.decks ?? {}) as [id] (id)}
	<Deck {id} />
{/each}

{#each cards as [id] (id)}
	<Card {id} />
{/each}

{#each Object.keys($gameStore?.pieces ?? {}).filter((key) => $gameStore?.pieces?.[key]) as id (id)}
	<Piece {id} />
{/each}
