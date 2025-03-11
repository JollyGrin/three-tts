<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { Collider, RigidBody } from '@threlte/rapier';
	import type { RigidBody as RapierRigidBody } from '@dimforge/rapier3d-compat';
	import { dragEnd, dragStart, dragStore } from './store/dragStore.svelte';
	import { objectStore, updateCardState } from './store/objectStore.svelte';
	import { spring } from 'svelte/motion';
	import { ImageMaterial } from '@threlte/extras';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';

	let { id } = $props();

	let card: THREE.Mesh | undefined = $state();

	const isDragging = $derived($dragStore.isDragging === id);
	const faceImageUrl = $derived($objectStore[id]?.faceImageUrl);
	let isHovered = $state(false);
	let emissiveIntensity = $state(0);
	let rigidBody = $state<RapierRigidBody | undefined>(undefined);

	// Spring store for height animation
	const height = spring(0.26, {
		stiffness: 0.15, // Slightly stiffer for faster initial movement
		damping: 0.7, // More damping for smoother settling
		precision: 0.0001 // Higher precision for smoother animation
	});

	// Get base position from store
	const basePosition = $derived($objectStore[id]?.position ?? [0, 0, 0]);
	const baseRotation = $derived($objectStore[id]?.rotation ?? [0, 0, 0]);

	// Create derived values for each component
	const posX = $derived(basePosition[0]);
	const posY = $derived($height);
	const posZ = $derived(basePosition[2]);

	// Combine components into position array
	const position: [number, number, number] = $derived([posX, posY, posZ]);

	$effect(() => {
		emissiveIntensity = isHovered ? 0.2 : 0;
	});

	$effect(() => {
		if (!rigidBody) return;
		rigidBody.wakeUp();

		if (isDragging) {
			const { x, z } = $dragStore.intersectionPoint as THREE.Vector3;
			rigidBody.setTranslation({ x, y: position[1], z }, true);
			rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true); // Clear velocity

			// TODO: this does not lerp. How can i make this lerp
			rigidBody.setRotation({ x: baseRotation[0], y: 0, z: 0, w: 0 }, true);
		} else {
			const currentPos = rigidBody.translation();
			const targetY = position[1];

			// Only update if there's a significant difference
			if (Math.abs(currentPos.y - targetY) > 0.001) {
				rigidBody.setTranslation({ x: position[0], y: targetY, z: position[2] }, true);
			}
		}
	});

	function handleDragStart() {
		dragStart(id, position[1]); // Pass current height
		// Animate to raised height with some extra bounce
		height.set(2.2);
		setTimeout(() => height.set(2), 150);
	}

	const handleDragEnd = dragEnd;
	$effect(() => {
		if (!isDragging) {
			// Animate back to table height with a subtle bounce
			height.set(0.22);
			setTimeout(() => height.set(0.26), 150);
		}
	});

	function handlePointerEnter() {
		if (!!$dragStore.isDragging) return;
		isHovered = true;
		$dragStore.isHovered = id;
	}

	function handlePointerLeave() {
		isHovered = false;
		$dragStore.isHovered = null;
	}

	$inspect('rot', baseRotation[0]);
</script>

<T.Group {position} rotation.x={DEG2RAD * baseRotation[0]}>
	<RigidBody bind:rigidBody type={'kinematicVelocity'} lockRotations={true}>
		<Collider shape={'cuboid'} args={[0.7, 0.02, 1]} friction={0.7} restitution={0.3} density={1} />
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
		<T.Mesh rotation.x={Math.PI / 2} position.y={-0.001} sides={2}>
			<T.PlaneGeometry args={[1.4, 2]} />
			<T.MeshBasicMaterial color="white" />
		</T.Mesh>
	</RigidBody>
</T.Group>
