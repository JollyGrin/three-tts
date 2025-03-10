<script lang="ts">
	import { T } from '@threlte/core';
	import { Collider, RigidBody } from '@threlte/rapier';
	import type { RigidBody as RapierRigidBody } from '@dimforge/rapier3d-compat';
	import { dragEnd, dragStart, dragStore } from './store/dragStore.svelte';
	import { objectStore, updateCardState } from './store/objectStore.svelte';

	let { id } = $props();

	const isDragging = $derived($dragStore.isDragging === id);
	let isHovered = $state(false);
	let emissiveIntensity = $state(0);
	let rigidBody = $state<RapierRigidBody | undefined>(undefined);

	// Get current position from store
	const position = $derived($objectStore[id]?.position ?? [0, 0, 0]);

	$inspect(isDragging);

	// Update emissive intensity on hover
	$effect(() => {
		emissiveIntensity = isHovered ? 0.5 : 0;
	});

	// Update rigid body position when store position changes
	$effect(() => {
		if (!rigidBody) return;

		// Only update position directly when dragging
		if (isDragging) {
			// Wake up the body and update position instantly
			rigidBody.wakeUp();
			rigidBody.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
		}
	});

	function handleDragStart() {
		dragStart(id, position[1]); // Pass current height
		console.log('start', position);
	}

	function handleDrag(event: {
		intersections: Array<{ point: { x: number; y: number; z: number } }>;
	}) {
		if ($dragStore.isDragging !== id) return;

		const [intersection] = event.intersections;
		if (!intersection) return;

		const { x, y, z } = intersection.point;
		updateCardState(id, [x, 1.5, z]);
	}

	function handleDragEnd() {
		console.log('end', position);
		dragEnd();
	}

	function handlePointerEnter() {
		isHovered = true;
	}

	function handlePointerLeave() {
		isHovered = false;
		handleDragEnd();
	}
</script>

<RigidBody
	bind:rigidBody
	type={isDragging ? 'kinematicPosition' : 'dynamic'}
	{position}
	lockRotations={true}
>
	<Collider restitution={0.4} shape={'cuboid'} args={[0.5, 0.1, 0.5]} />
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
