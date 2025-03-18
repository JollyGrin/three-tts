<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import * as THREE from 'three';
	import { useViewport, ImageMaterial, interactivity } from '@threlte/extras';
	import { objectStore } from './store/objectStore.svelte';
	import { dragEnd, dragStart, dragStore } from './store/dragStore.svelte';
	import { Spring } from 'svelte/motion';

	interactivity();
	let {}: {} = $props();

	const viewport = useViewport();

	// Calculate hand tray position and dimensions
	// Position at bottom left, half width of screen
	const trayWidth = $derived($viewport.width / 2);
	const trayHeight = $derived($viewport.height / 6); // Adjust height as needed
	const trayX = $derived(-$viewport.width / 2 + trayWidth / 2);
	const trayY = $derived(-$viewport.height / 2 + trayHeight / 2);

	// Red square in top right (keeping this from original)
	const redSquarePosition = $derived([$viewport.width / 2 - 1.2, $viewport.height / 2 - 2, 0]);

	let trayMesh: THREE.Mesh | undefined = $state(undefined);
	let redSquareMesh: THREE.Mesh | undefined = $state(undefined);
	let cardMesh: THREE.Mesh | undefined = $state(undefined);

	const cardImageUrl = 'https://card.cards.army/cards//beast_of_burden.webp';
	let isCardHovered = $state(false);
	let isDragging = $state(false);
	let isTrayHovered = $state(false);
	let emissiveIntensity = $state(0);

	$effect(() => {
		emissiveIntensity = isCardHovered ? 0.05 : 0;
	});

	const cardSize = [1.4 * 1.4, 2 * 1.4];
	const cardY = new Spring(0, {
		stiffness: 0.15, // Slightly stiffer for faster initial movement
		damping: 0.7, // More damping for smoother settling
		precision: 0.0001 // Higher precision for smoother animation
	});
	const cardScale = new Spring(0.55, {
		stiffness: 0.15, // Slightly stiffer for faster initial movement
		damping: 0.7, // More damping for smoother settling
		precision: 0.0001 // Higher precision for smoother animation
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
</script>

<T.OrthographicCamera makeDefault zoom={80} position={[0, 0, 10]} />
<T.AmbientLight intensity={Math.PI / 2} />
<T.PointLight position={[10, 10, 10]} decay={0} intensity={Math.PI * 2} />

<!-- Hand tray at bottom left -->
<T.Group position={[trayX, trayY, 0] as [number, number, number]}>
	<T.Mesh
		bind:ref={trayMesh}
		onpointerenter={() => (isTrayHovered = true)}
		onpointerleave={() => (isTrayHovered = false)}
	>
		<T.PlaneGeometry args={[trayWidth, trayHeight]} />
		<T.MeshBasicMaterial color="white" transparent opacity={isTrayHovered ? 0.3 : 0.1} side={2} />
	</T.Mesh>

	<T.Mesh
		scale={cardScale.current}
		position.y={cardY.current}
		onpointerenter={handlePointerEnter}
		onpointerleave={handlePointerLeave}
		onpointerdown={handleDragStart}
		onpointerup={dragEnd}
	>
		<T.PlaneGeometry args={cardSize} />
		<ImageMaterial url={cardImageUrl} side={2} radius={0.1} transparent={true} opacity={0.9} />
	</T.Mesh>
</T.Group>

{#if false}
	<!-- Original red square in top right -->
	<T.Mesh
		position={redSquarePosition as [number, number, number]}
		scale={1}
		bind:ref={redSquareMesh}
	>
		<T.PlaneGeometry args={cardSize} />
		<ImageMaterial
			url={cardImageUrl}
			side={2}
			radius={0.1}
			monochromeColor={'#fff'}
			monochromeStrength={emissiveIntensity}
			transparent={true}
			opacity={0.9}
		/>
	</T.Mesh>
{/if}
