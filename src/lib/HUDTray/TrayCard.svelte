<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { ImageMaterial, interactivity } from '@threlte/extras';
	import { objectStore } from '$lib/store/objectStore.svelte';
	import { dragEnd, dragStart, dragStore } from '$lib/store/dragStore.svelte';
	import { Spring } from 'svelte/motion';

	interactivity();
	let {}: {} = $props();

	const cardImageUrl = 'https://card.cards.army/cards//beast_of_burden.webp';
	let isCardHovered = $state(false);
	let emissiveIntensity = $state(0);

	$effect(() => {
		emissiveIntensity = isCardHovered ? 0.05 : 0;
	});

	const cardSize = [1.4 * 1.4, 2 * 1.4];
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
		cardScale.target = 1.25;
		cardY.target = 1;
	}
	function handlePointerLeave() {
		isCardHovered = false;
		cardScale.target = 0.55;
		cardY.target = 0;
	}
	function handleDragStart() {
		const { x, z } = $dragStore.intersectionPoint as THREE.Vector3;
		objectStore.updateCardState('cardx', [x, 2.5, z], cardImageUrl);
		dragStart('cardx', 2.5);
	}
	function handleDragEnd() {
		dragEnd();
	}
</script>

<T.Mesh
	scale={cardScale.current}
	position.y={cardY.current}
	position.x={2}
	onpointerenter={handlePointerEnter}
	onpointerleave={handlePointerLeave}
	onpointerdown={handleDragStart}
	onpointerup={handleDragEnd}
>
	<T.PlaneGeometry args={cardSize} />
	<ImageMaterial url={cardImageUrl} side={2} radius={0.1} transparent={true} opacity={0.9} />
</T.Mesh>
