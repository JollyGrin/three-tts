<script lang="ts">
	import { T } from '@threlte/core';
	import { Collider, RigidBody } from '@threlte/rapier';
	import { dragEnd, dragStart, dragStore } from './store/dragStore.svelte';
	import { objectStore, updateCardState } from './store/objectStore.svelte';
	import type { Group } from 'three';

	let { id } = $props();

	let isHovered = $state(false);
	let emissiveIntensity = $state(0);
	let groupRef = $state<Group | undefined>(undefined);

	// Get current position from store
	const position = $derived($objectStore[id]?.position ?? [0, 0, 0]);

	// Update emissive intensity on hover
	$effect(() => {
		emissiveIntensity = isHovered ? 0.5 : 0;
	});

	// Update group position when store position changes
	$effect(() => {
		if (!groupRef) return;
		if ($dragStore.isDragging === id) {
			// Instant update during drag
			groupRef.position.set(...position);
		} else {
			// Smooth transition when not dragging
			const lerp = (a: number, b: number) => a + (b - a) * 0.1;
			groupRef.position.x = lerp(groupRef.position.x, position[0]);
			groupRef.position.y = lerp(groupRef.position.y, position[1]);
			groupRef.position.z = lerp(groupRef.position.z, position[2]);
		}
	});

	function handleDragStart() {
		dragStart(id, position[1]); // Pass current height
	}

	function handleDrag(event) {
		if ($dragStore.isDragging !== id) return;

		const [intersection] = event.intersections;
		if (!intersection) return;

		const { x, z } = intersection.point;
		updateCardState(id, [x, $dragStore.dragHeight ?? position[1], z]);
	}

	function handleDragEnd() {
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

<T.Group bind:ref={groupRef} {position}>
	<RigidBody type={$dragStore.isDragging === id ? 'kinematicPosition' : 'dynamic'}>
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
</T.Group>
