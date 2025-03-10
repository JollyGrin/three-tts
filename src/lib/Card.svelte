<script lang="ts">
	import { T } from '@threlte/core';
	import { Collider, RigidBody } from '@threlte/rapier';

	let { position = [0, 0, 0] as [number, number, number] } = $props();

	let isDragging = $state(false);
	let isHovered = $state(false);
	let emissiveIntensity = $state(0);

	$effect(() => {
		emissiveIntensity = isHovered ? 0.5 : 0;
	});

	function handleDragStart() {
		isDragging = true;
	}

	function handleDrag(event: { delta: [number, number] }) {
		const [x, z] = event.delta;
		position = [position[0] + x * 0.01, position[1], position[2] + z * 0.01];
	}

	function handleDragEnd() {
		isDragging = false;
	}

	function handlePointerEnter() {
		console.log('hi');
		isHovered = true;
	}

	function handlePointerLeave() {
		isHovered = false;
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
