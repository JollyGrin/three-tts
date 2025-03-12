<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import * as THREE from 'three';
	import { useViewport, ImageMaterial } from '@threlte/extras';

	let {}: {} = $props();

	const viewport = useViewport();

	// Calculate hand tray position and dimensions
	// Position at bottom left, half width of screen
	const trayWidth = $derived($viewport.width / 2);
	const trayHeight = $derived($viewport.height / 6); // Adjust height as needed
	const trayX = $derived(-$viewport.width / 2 + trayWidth / 2);
	const trayY = $derived(-$viewport.height / 2 + trayHeight / 2);

	// Red square in top right (keeping this from original)
	const redSquarePosition = $derived([$viewport.width / 2 - 1.2, $viewport.height / 2 - 2, 0]);

	let trayMesh: THREE.Mesh | undefined = $state(undefined);
	let redSquareMesh: THREE.Mesh | undefined = $state(undefined);
	let cardMesh: THREE.Mesh | undefined = $state(undefined);

	// Sample card for the hand
	const cardImageUrl = 'https://card.cards.army/cards//beast_of_burden.webp';
	let isCardHovered = $state(false);
	let emissiveIntensity = $state(0);

	// Card positioning
	const cardWidth = 4.0; // Larger width
	const cardHeight = 6.0; // Larger height
	const cardX = $derived(trayX);
	const cardY = $derived(trayY);
	const cardZ = $derived(1); // Higher z-position to be above tray
	const scaleX = $derived(3);
	const scaleY = $derived(3);
	const scaleZ = $derived(3);

	$effect(() => {
		emissiveIntensity = isCardHovered ? 0.2 : 0;
	});

	function handlePointerEnter() {
		isCardHovered = true;
	}

	function handlePointerLeave() {
		isCardHovered = false;
	}
</script>

<T.OrthographicCamera makeDefault zoom={80} position={[0, 0, 10]} />
<T.AmbientLight intensity={Math.PI / 2} />
<T.PointLight position={[10, 10, 10]} decay={0} intensity={Math.PI * 2} />

<!-- Hand tray at bottom left -->
<T.Mesh position={[trayX, trayY, 0] as [number, number, number]} bind:ref={trayMesh}>
	<T.PlaneGeometry args={[trayWidth, trayHeight]} />
	<T.MeshBasicMaterial color="white" transparent opacity={0.1} side={2} />
</T.Mesh>

<!-- Card in the hand tray -->
<T.Mesh
	position={[cardX, cardY, cardZ] as [number, number, number]}
	scale.x={scaleX}
	scale.y={scaleY}
	scale.z={scaleZ}
	bind:ref={cardMesh}
	rotation.x={-Math.PI / 2}
	on:pointerenter={handlePointerEnter}
	on:pointerleave={handlePointerLeave}
>
	<T.PlaneGeometry args={[cardWidth, cardHeight]} />
	<ImageMaterial
		url={cardImageUrl}
		side={2}
		radius={0.1}
		monochromeColor={'#fff'}
		monochromeStrength={emissiveIntensity}
	/>
</T.Mesh>

<!-- Original red square in top right -->
<T.Mesh position={redSquarePosition as [number, number, number]} scale={1} bind:ref={redSquareMesh}>
	<T.PlaneGeometry args={[1.4 * 1.4, 2 * 1.4]} />
	<ImageMaterial
		url={cardImageUrl}
		side={2}
		radius={0.1}
		monochromeColor={'#fff'}
		monochromeStrength={emissiveIntensity}
		transparent={true}
		opacity={0.9}
	/>
</T.Mesh>
