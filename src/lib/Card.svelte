<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { RigidBody as RapierRigidBody } from '@dimforge/rapier3d-compat';
	import { dragEnd, dragStart, dragStore } from './store/dragStore.svelte';
	import { objectStore } from './store/objectStore.svelte';
	import { Spring } from 'svelte/motion';
	import { ImageMaterial } from '@threlte/extras';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { trayStore } from './store/trayStore.svelte';
	import { degrees, seatStore } from './store/seatStore.svelte';

	let { id } = $props();

	let card: THREE.Mesh | undefined = $state();

	const isDragging = $derived($dragStore.isDragging === id);
	const faceImageUrl = $derived($objectStore[id]?.faceImageUrl);
	const backImageUrl = $derived($objectStore[id]?.backImageUrl);
	let isHovered = $state(false);
	let emissiveIntensity = $state(0);

	const height = new Spring(0.26, {
		stiffness: 0.15,
		damping: 0.7,
		precision: 0.0001
	});

	const rotation = new Spring(0, {
		stiffness: 0.1,
		damping: 0.8,
		precision: 0.001
	});

	const seatRotation = $derived(degrees[$seatStore.seat] / DEG2RAD);
	const rotationTap = new Spring(-seatRotation, {
		stiffness: 0.1,
		damping: 0.8,
		precision: 0.001
	});
	$inspect('tap', rotationTap.current);

	// Get base position from store
	const basePosition = $derived($objectStore[id]?.position ?? [0, 0, 0]);
	const baseRotation = $derived($objectStore[id]?.rotation ?? [0, 0, 0]);
	$inspect(baseRotation);

	// Create derived values for each component
	const posX = $derived(basePosition[0]);
	const posY = $derived(height.current);
	const posZ = $derived(basePosition[2]);

	// Combine components into position array
	const position: [number, number, number] = $derived([posX, posY, posZ]);

	// Make card glow when hovered
	$effect(() => {
		emissiveIntensity = isHovered ? 0.2 : 0;
	});

	// Tap card
	$effect(() => {
		rotation.target = baseRotation[0];
		rotationTap.target = baseRotation[2];

		if (!isDragging) {
			// elevate the card if on the table to prevent clipping through
			height.target = 1.5;
			setTimeout(() => (height.target = 0.26), 350);
		}
	});

	function handleDragStart() {
		dragStart(id, position[1]); // Pass current height

		// Animate to raised height with some extra bounce
		height.target = 2.2;
		setTimeout(() => (height.target = 2), 150);
	}

	const handleDragEnd = () => {
		if ($dragStore.isTrayHovered) {
			console.log('Storing in hand:', id, faceImageUrl);
			trayStore.updateCardState(id, [0, 0, 0], faceImageUrl);
			objectStore.removeCard(id);
		}
		dragEnd();
	};

	function handlePointerEnter() {
		if (!!$dragStore.isDragging) return;
		isHovered = true;
		$dragStore.isHovered = id;
	}

	function handlePointerLeave() {
		isHovered = false;
		$dragStore.isHovered = null;
	}
</script>

<T.Group
	{position}
	rotation.x={rotation.current * DEG2RAD}
	rotation.y={rotationTap.current * -DEG2RAD}
>
	<T.Mesh
		castShadow
		receiveShadow
		bind:ref={card}
		rotation.x={-Math.PI / 2}
		onpointerdown={handleDragStart}
		onpointerup={handleDragEnd}
		onpointerleave={handlePointerLeave}
		onpointerenter={handlePointerEnter}
	>
		<T.PlaneGeometry args={[1.4, 2]} />
		<ImageMaterial
			url={faceImageUrl}
			side={2}
			radius={0.1}
			monochromeColor={'#fff'}
			monochromeStrength={emissiveIntensity}
		/>
	</T.Mesh>

	{#if backImageUrl}
		<T.Mesh
			castShadow
			receiveShadow
			rotation.z={DEG2RAD * 180}
			rotation.x={-Math.PI / 2}
			position.y={-0.002}
			<!--
			onpointerdown={handleDragStart}
			--
		>
			<!-- onpointerup={handleDragEnd} -->
			<!-- onpointerleave={handlePointerLeave} -->
			<!-- onpointerenter={handlePointerEnter} -->
			>
			<T.PlaneGeometry args={[1.4, 2]} />
			<ImageMaterial
				url={backImageUrl}
				side={2}
				radius={0.1}
				monochromeColor={'#fff'}
				monochromeStrength={emissiveIntensity}
			/>
		</T.Mesh>
	{:else}
		<T.Mesh rotation.x={Math.PI / 2} position.y={-0.002} sides={1}>
			<T.PlaneGeometry args={[1.4, 2]} />
			<T.MeshBasicMaterial color="white" />
		</T.Mesh>
	{/if}
</T.Group>
