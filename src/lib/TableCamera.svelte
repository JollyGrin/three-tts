<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js';
	import * as THREE from 'three';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { cameraResetSignal } from '$lib/store/cameraStore.svelte';
	import { gameActions } from './store/game/actions';
	import { gameStore } from './store/game/gameStore.svelte';

	const isDragging = $derived($dragStore.isDragging !== null);

	const y = 25;
	const seating = [
		[0, y, 0],
		[0, y, -0.01],
		[0.1, y, 0],
		[-0.1, y, 0]
	];

	const myId = gameActions?.getMyId() ?? '';
	const seat = $derived($gameStore?.players?.[myId]?.seat ?? 0);

	let camera: THREE.PerspectiveCamera | undefined = $state();
	let controls: OrbitControlsType | undefined = $state();

	// reset to the seat's default birds-eye view when requested (keybind C)
	$effect(() => {
		if ($cameraResetSignal === 0) return;
		const [px, py, pz] = seating[seat];
		if (!camera || !controls) return;
		camera.position.set(px, py, pz);
		controls.target.set(0, 0, 0);
		controls.update();
	});
</script>

<!-- near/far bound tightly to the orbit range (min 1 / max 40): depth precision
     is proportional to near/far ratio, and card faces are only 0.02 apart -->
<T.PerspectiveCamera
	makeDefault
	bind:ref={camera}
	position={seating[seat] as [number, number, number]}
	fov={35}
	near={0.5}
	far={200}
>
	<OrbitControls
		bind:ref={controls}
		enableRotate={!isDragging}
		enableDamping
		maxPolarAngle={Math.PI / 2 - 0.1}
		target={[0, 0, 0]}
		minDistance={1}
		maxDistance={40}
	/>
</T.PerspectiveCamera>
