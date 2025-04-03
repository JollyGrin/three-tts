<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { ImageMaterial, interactivity } from '@threlte/extras';
	import { objectStore } from '$lib/store/objectStore.svelte';
	import { dragEnd, dragStart, dragStore } from '$lib/store/dragStore.svelte';
	import { Spring } from 'svelte/motion';
	import { trayStore } from '$lib/store/trayStore.svelte';
	import { degrees, seatStore } from '$lib/store/seatStore.svelte';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';

	interactivity();
	let {
		id,
		index = 0,
		trayWidth = 0
	}: { id: string; index: number; trayWidth?: number } = $props();
	const card = $derived($trayStore[id]);

	let isCardHovered = $state(false);
	let emissiveIntensity = $state(0);

	$effect(() => {
		emissiveIntensity = isCardHovered ? 0.05 : 0;
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
		isCardHovered = true;
		cardScale.target = 1.5;
		cardY.target = 1.5;
		cardZ = 1;
	}
	function handlePointerLeave() {
		isCardHovered = false;
		cardScale.target = 0.55;
		cardY.target = 0;
		cardZ = 0;
	}
	function handleDragStart() {
		const { x = 0, z = 0 } = $dragStore.intersectionPoint as THREE.Vector3;
		objectStore.updateCardState(id, [x, 2.5, z], card.faceImageUrl, [
			0,
			0,
			-degrees[$seatStore.seat] / DEG2RAD // should be facing the player in seat
		]);
		trayStore.removeCard(id);
		dragStart(id, 2.5);
	}
</script>

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
	<ImageMaterial url={card.faceImageUrl} side={2} radius={0.1} transparent={true} opacity={0.9} />
</T.Mesh>
