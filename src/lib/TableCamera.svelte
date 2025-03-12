<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { dragStore } from '$lib/store/dragStore.svelte';

	const isDragging = $derived($dragStore.isDragging !== null);
</script>

<T.PerspectiveCamera makeDefault position={[0, 30, 0]} rotation.x={-Math.PI / 2} fov={35}>
	<OrbitControls
		enableRotate={!isDragging}
		enableDamping
		maxPolarAngle={Math.PI / 2 - 0.1}
		target={[0, 0, 0]}
		minDistance={1}
		maxDistance={40}
	/>
</T.PerspectiveCamera>
