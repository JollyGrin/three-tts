<script lang="ts">
	import { T } from '@threlte/core';
	import { Collider, RigidBody } from '@threlte/rapier';
	import { Spring } from 'svelte/motion';
	import { Vector3 } from 'three';

	let { position = [0, 0, 0] as [number, number, number] } = $props();

	let rigidBody = $state();
	let isDragging = $state(false);

	const targetPosition = new Spring(position, {
		stiffness: 0.1,
		damping: 0.8
	});

	function handleDragStart() {
		isDragging = true;
		// rigidBody.setTranslation(new Vector3(...$targetPosition), true);
	}

	function handleDrag(event: { delta: [number, number] }) {
		const [x, z] = event.delta;
		targetPosition.update((pos) => [pos[0] + x * 0.01, pos[1], pos[2] + z * 0.01]);
		// rigidBody.setTranslation(new Vector3(...$targetPosition), true);
	}

	function handleDragEnd() {
		isDragging = false;
	}
</script>

<T.Group {position}>
	<RigidBody type={isDragging ? 'kinematicPosition' : 'dynamic'}>
		<Collider
			contactForceEventThreshold={30}
			restitution={0.4}
			shape={'cuboid'}
			args={[0.5, 0.5, 0.5]}
		/>
		<T.Mesh
			rotation.x={-Math.PI / 2}
			position.y={0.01}
			on:pointerdown={handleDragStart}
			on:pointermove={handleDrag}
			on:pointerup={handleDragEnd}
			on:pointerleave={handleDragEnd}
		>
			<T.PlaneGeometry args={[1.4, 2]} />
			<T.MeshStandardMaterial color="white" />
		</T.Mesh>
	</RigidBody>
</T.Group>
