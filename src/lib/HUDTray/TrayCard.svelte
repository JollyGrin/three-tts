<script lang="ts" module>
	import { writable } from 'svelte/store';

	// Single shared hover owner across all tray cards. Expanded cards overlap
	// their neighbors, so per-card enter/leave flags could leave two cards
	// expanded at once — the latest pointerenter claims hover, collapsing the rest.
	const hoveredTrayCard = writable<string | null>(null);
</script>

<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { ImageMaterial, interactivity } from '@threlte/extras';
	import { Spring } from 'svelte/motion';
	import { degrees } from '$lib/utils/constants-rotation';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { resolveCardImage, sheetRefCache, CARD_BACK_DEFAULT } from '$lib/packs';
	import { dragStart, dragStore } from '$lib/store/dragStore.svelte';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { gameActions } from '$lib/store/game/actions';

	interactivity();
	let {
		id,
		index = 0,
		trayWidth = 0
	}: { id: string; index: number; trayWidth?: number } = $props();

	const myPlayerId = $derived(gameActions?.getMe()?.id ?? '');
	const card = $derived($gameStore?.players?.[myPlayerId]?.tray?.[id] ?? {});
	const trayUrl = $derived(resolveCardImage(card.faceImageUrl, $sheetRefCache));

	const isCardHovered = $derived($hoveredTrayCard === id);
	let emissiveIntensity = $state(0);

	$effect(() => {
		emissiveIntensity = isCardHovered ? 0.05 : 0;
	});

	// expansion follows the shared hover owner, not raw enter/leave events
	$effect(() => {
		if (isCardHovered) {
			cardScale.target = 1.5;
			cardY.target = 1.5;
			cardZ = 1;
		} else {
			cardScale.target = 0.55;
			cardY.target = 0;
			cardZ = 0;
		}
	});

	const cardSize = [1.4 * 1.4, 2 * 1.4];
	let cardZ = $state(0); // z-index
	const cardY = new Spring(0, {
		stiffness: 0.15,
		damping: 0.7,
		precision: 0.0001
	});
	const cardScale = new Spring(0.55, {
		stiffness: 0.15,
		damping: 0.7,
		precision: 0.0001
	});

	function handlePointerEnter() {
		hoveredTrayCard.set(id);
	}
	function handlePointerLeave() {
		// guard: a stale leave (fired after a neighbor claimed hover) must not
		// clear the neighbor's expansion
		hoveredTrayCard.update((current) => (current === id ? null : current));
	}
	function handleDragStart() {
		const { x = 0, z = 0 } = $dragStore.intersectionPoint as THREE.Vector3;
		gameActions.moveCardOutOfTray(id, myPlayerId, {
			position: [x, 2.5, z],
			// 180 on x = facedown (matches flipCard convention) — cards leave the hand hidden
			rotation: [180, 0, -degrees[gameActions?.getMySeat()] / DEG2RAD],
			backImageUrl: card.backImageUrl ?? CARD_BACK_DEFAULT // TODO: update this with its actual cardback
		});
		dragStart(id, 2.5);
	}
</script>

{#key trayUrl}
	<T.Mesh
		scale={cardScale.current}
		position.z={cardZ}
		position.y={cardY.current}
		position.x={-trayWidth / 2 + 1.25 + index * 1.2}
		onpointerenter={handlePointerEnter}
		onpointerleave={handlePointerLeave}
		onpointerdown={handleDragStart}
	>
		<T.PlaneGeometry args={cardSize} />
		<ImageMaterial url={trayUrl} side={2} radius={0.1} transparent={true} opacity={0.9} />
	</T.Mesh>
{/key}
