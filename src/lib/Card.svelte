<script lang="ts">
	//TODO: figure out how to have the original position before rigid body is applied?

	import { T } from '@threlte/core';
	import { Collider, RigidBody } from '@threlte/rapier';
	import type { RigidBody as RapierRigidBody } from '@dimforge/rapier3d-compat';
	import { dragEnd, dragStart, dragStore } from './store/dragStore.svelte';
	import { objectStore, updateCardState } from './store/objectStore.svelte';
	import { spring } from 'svelte/motion';

	let { id } = $props();

	const isDragging = $derived($dragStore.isDragging === id);
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

	// Create derived values for each component
	const posX = $derived(basePosition[0]);
	const posY = $derived($height);
	const posZ = $derived(basePosition[2]);

	// Combine components into position array
	const position: [number, number, number] = $derived([posX, posY, posZ]);

	$inspect(isDragging);

	// Update emissive intensity on hover
	$effect(() => {
		emissiveIntensity = isHovered ? 0.5 : 0;
	});

	// Update rigid body position when position changes
	$effect(() => {
		if (!rigidBody) return;

		// Always wake up the body when updating position
		rigidBody.wakeUp();

		// Update position and handle physics state
		if (isDragging) {
			// When dragging, instantly update position and enable kinematic mode
			rigidBody.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
			rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true); // Clear velocity
		} else {
			// When not dragging, smoothly transition to physics control
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
		console.log('start', position);
	}

	function handleDrag(event: {
		intersections: Array<{ point: { x: number; y: number; z: number } }>;
	}) {
		if ($dragStore.isDragging !== id) return;

		const [intersection] = event.intersections;
		if (!intersection) return;

		const { x, z } = intersection.point;
		updateCardState(id, [x, position[1], z]);
	}

	function handleDragEnd() {
		console.log('end', position);
		dragEnd();
		// Animate back to table height with a subtle bounce
		height.set(0.22);
		setTimeout(() => height.set(0.26), 150);
	}

	function handlePointerEnter() {
		isHovered = true;
	}

	function handlePointerLeave() {
		isHovered = false;
		if (isDragging) handleDragEnd();
	}
</script>

<T.Group {position}>
	<RigidBody
		bind:rigidBody
		type={isDragging ? 'kinematicPosition' : 'dynamic'}
		lockRotations={true}
	>
		<Collider restitution={0.4} shape={'cuboid'} args={[2, 0.1, 1.5]} />
		<T.Mesh
			rotation.x={-Math.PI / 2}
			onpointerdown={handleDragStart}
			onpointermove={handleDrag}
			onpointerup={handleDragEnd}
			onpointerleave={handlePointerLeave}
			onpointerenter={handlePointerEnter}
		>
			<T.PlaneGeometry args={[1.4, 2]} />
			<T.MeshStandardMaterial color="white" emissive="#4444ff" {emissiveIntensity} />
		</T.Mesh>
	</RigidBody>
</T.Group>
