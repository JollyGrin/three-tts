<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import { HUD, interactivity } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
	import TableCamera from './TableCamera.svelte';
	import Intersection from './Intersection.svelte';
	import HudTrayScene from '$lib/HUDTray/HUDTrayScene.svelte';
	import Deck from './Deck.svelte';
	import Piece from './Piece.svelte';
	import Hdr from './HDR.svelte';
	import HudPreviewScene from './HUDPreview/HUDPreviewScene.svelte';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { gameStore } from './store/game/gameStore.svelte';
	import type { GameDTO } from './store/game/types';
	type CardDTO = GameDTO['cards'][string];

	const isDragging = $derived($dragStore.isDragging !== null);
	let mesh: THREE.Mesh | undefined = $state();
	const { camera } = useThrelte();

	let intersectionPoint: THREE.Vector3 | null = $state(null);

	// table is a 60×30 box centered at origin; dragged entities are clamped a
	// margin inside the edge so they always stay on the felt and grabbable
	const TABLE_HALF_X = 30;
	const TABLE_HALF_Z = 15;
	const EDGE_MARGIN = 1;
	// fallback for when the pointer leaves the table mesh: the infinite plane at
	// tabletop height keeps a drag tracking instead of yielding a null hit
	const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.255);
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
				const { x, z } = intersectionPoint;
				const cx = THREE.MathUtils.clamp(x, -TABLE_HALF_X + EDGE_MARGIN, TABLE_HALF_X - EDGE_MARGIN);
				const cz = THREE.MathUtils.clamp(z, -TABLE_HALF_Z + EDGE_MARGIN, TABLE_HALF_Z - EDGE_MARGIN);
				const dragId = $dragStore.isDragging as string;
				if (dragId.startsWith('piece:')) {
					gameStore.updateState({ pieces: { [dragId]: { position: [cx, 1.2, cz] } } });
				} else {
					gameStore.updateState({ cards: { [dragId]: { position: [cx, 2.5, cz] } } });
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
<Intersection />
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
