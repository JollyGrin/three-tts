<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { seatStore } from '$lib/store/seatStore.svelte';

	const isDragging = $derived($dragStore.isDragging !== null);

	const y = 25;
	const seating = [
		[0, y, 0],
		[0, y, -0.01],
		[0.1, y, 0],
		[-0.1, y, 0]
	];
</script>

<T.PerspectiveCamera
	makeDefault
	position={seating[$seatStore.seat] as [number, number, number]}
	fov={35}
>
	<OrbitControls
		enableRotate={!isDragging}
		enableDamping
		maxPolarAngle={Math.PI / 2 - 0.1}
		target={[0, 0, 0]}
		minDistance={1}
		maxDistance={40}
	/>
</T.PerspectiveCamera>
