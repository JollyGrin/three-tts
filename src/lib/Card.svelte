<script lang="ts">
	import { T } from '@threlte/core';
	import { Collider, RigidBody } from '@threlte/rapier';
	import { dragEnd, dragStart, dragStore } from './store/dragStore.svelte';
	import { objectStore, updateCardState } from './store/objectStore.svelte';

	let { id = '', position = [0, 0, 0] as [number, number, number] } = $props();

	let isHovered = $state(false);
	let emissiveIntensity = $state(0);

	$inspect(position);

	$effect(() => {
		emissiveIntensity = isHovered ? 0.5 : 0;
	});

	function handleDragStart() {
		console.log('Drag start:', id);
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
		console.log('Drag end:', id);
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

<T.Group {position}>
	<RigidBody type={$dragStore.isDragging === id ? 'kinematicPosition' : 'dynamic'}>
		<Collider
			contactForceEventThreshold={30}
			restitution={0.4}
			shape={'cuboid'}
			args={[0.5, 0.5, 0.5]}
		/>
		<T.Mesh
			rotation.x={-Math.PI / 2}
			position.y={0.01}
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
