<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import * as THREE from 'three';
	import { useViewport } from '@threlte/extras';

	let {}: {} = $props();

	const viewport = useViewport();
	const viewportPosition = $derived([$viewport.width / 2 - 1, $viewport.height / 2 - 1, 0]);

	let mesh: THREE.Mesh | undefined = $state(undefined);
</script>

<T.OrthographicCamera makeDefault zoom={80} position={[0, 0, 10]} />
<T.AmbientLight intensity={Math.PI / 2} />
<T.PointLight position={[10, 10, 10]} decay={0} intensity={Math.PI * 2} />

<T.Mesh position={viewportPosition as [number, number, number]} scale={1} bind:ref={mesh}>
	<T.PlaneGeometry args={[1, 1]} />
	<T.MeshToonMaterial color="red" side={2} />
</T.Mesh>
