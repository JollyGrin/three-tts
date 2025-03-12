<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import * as THREE from 'three';
	import { useViewport } from '@threlte/extras';

	let {}: {} = $props();

	const viewport = useViewport();
	
	// Calculate hand tray position and dimensions
	// Position at bottom left, half width of screen
	const trayWidth = $derived($viewport.width / 2);
	const trayHeight = $derived($viewport.height / 6); // Adjust height as needed
	const trayX = $derived(-$viewport.width / 2 + trayWidth / 2);
	const trayY = $derived(-$viewport.height / 2 + trayHeight / 2);
	
	// Red square in top right (keeping this from original)
	const redSquarePosition = $derived([$viewport.width / 2 - 1, $viewport.height / 2 - 1, 0]);
	
	let trayMesh: THREE.Mesh | undefined = $state(undefined);
	let redSquareMesh: THREE.Mesh | undefined = $state(undefined);
</script>

<T.OrthographicCamera makeDefault zoom={80} position={[0, 0, 10]} />
<T.AmbientLight intensity={Math.PI / 2} />
<T.PointLight position={[10, 10, 10]} decay={0} intensity={Math.PI * 2} />

<!-- Hand tray at bottom left -->
<T.Mesh 
	position={[trayX, trayY, 0] as [number, number, number]} 
	bind:ref={trayMesh}
>
	<T.PlaneGeometry args={[trayWidth, trayHeight]} />
	<T.MeshBasicMaterial color="white" transparent opacity={0.1} side={2} />
</T.Mesh>

<!-- Original red square in top right -->
<T.Mesh position={redSquarePosition as [number, number, number]} scale={1} bind:ref={redSquareMesh}>
	<T.PlaneGeometry args={[1, 1]} />
	<T.MeshToonMaterial color="red" side={2} />
</T.Mesh>
