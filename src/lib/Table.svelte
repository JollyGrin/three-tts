<script lang="ts">
	import { T } from '@threlte/core';
	import { RigidBody, Collider } from '@threlte/rapier';
	import * as THREE from 'three';
	import { dragEnd } from './store/dragStore.svelte';
	import { onDestroy } from 'svelte';

	let { mesh = $bindable() }: { mesh?: THREE.Mesh } = $props();
	let feltMaterial: THREE.MeshStandardMaterial | undefined = $state();

	// Create procedural felt texture
	$effect(() => {
		// Create canvas for procedural texture
		const canvas = document.createElement('canvas');
		canvas.width = 512;  
		canvas.height = 512;
		const ctx = canvas.getContext('2d')!;

		// Fill base color (darker)
		ctx.fillStyle = '#2a503d';
		ctx.fillRect(0, 0, 512, 512);

		// Add cross-hatch pattern
		ctx.strokeStyle = '#35654d';
		ctx.lineWidth = 1;
		
		// Horizontal lines
		for (let y = 0; y < 512; y += 4) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(512, y);
			ctx.stroke();
		}
		
		// Vertical lines
		for (let x = 0; x < 512; x += 4) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, 512);
			ctx.stroke();
		}

		// Add noise pattern for felt texture
		for (let i = 0; i < 100000; i++) {
			const x = Math.random() * 512;
			const y = Math.random() * 512;
			const brightness = Math.random() < 0.5 ? 0.7 : 1.0;  
			ctx.fillStyle = `rgba(53, 101, 77, ${brightness})`;
			ctx.fillRect(x, y, 2, 2);  
		}

		// Create texture from canvas
		const texture = new THREE.CanvasTexture(canvas);
		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
		texture.repeat.set(4, 2);  

		// Create material with felt-like properties
		feltMaterial = new THREE.MeshStandardMaterial({
			map: texture,
			roughness: 0.9,  
			metalness: 0.0,  
			bumpMap: texture,
			bumpScale: 0.02,  
			side: THREE.DoubleSide
		});
	});

	onDestroy(() => {
		if (feltMaterial) {
			feltMaterial.map?.dispose();
			feltMaterial.bumpMap?.dispose();
			feltMaterial.dispose();
		}
	});
</script>

<T.Group position={[0, 0, 0]}>
	<RigidBody type="fixed">
		<Collider shape="cuboid" args={[30, 0.256, 15]} friction={1} restitution={1}>
			<T.Mesh receiveShadow bind:ref={mesh} onpointerup={dragEnd}>
				<T.BoxGeometry args={[60, 0.5, 30]} />
				{#if feltMaterial}
					<T is={feltMaterial} />
				{:else}
					<T.MeshStandardMaterial color="#35654d" />
				{/if}
			</T.Mesh>
		</Collider>
	</RigidBody>
</T.Group>
