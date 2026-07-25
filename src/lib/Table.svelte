<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { onDestroy } from 'svelte';
	import { Grid } from '@threlte/extras';
	import { gameStore } from './store/game/gameStore.svelte';
	import OverlayCustom from './table-overlay/OverlayCustom.svelte';
	import { commitActiveDrag } from './drop/commit';
	import { setNoSnap } from './store/dragStore.svelte';
	import type { IntersectionEvent } from '@threlte/extras';
	import { TABLE_TOP_Y } from './utils/constants-table';

	let { mesh = $bindable() }: { mesh?: THREE.Mesh } = $props();

	// The drop lives in drop/commit.ts — shared with the window-level release
	// fallback, and resolved by the same pure function the DropIndicator
	// previews with, so what the player saw while dragging is what lands.
	// Alt state is taken off the release itself, so a modifier let go in the
	// same instant as the button can't leave the commit disagreeing with the
	// preview.
	function handleDragEnd(event: IntersectionEvent<PointerEvent>) {
		setNoSnap(event.nativeEvent.altKey);
		commitActiveDrag();
	}

	// Create procedural felt texture. Built synchronously: this component only
	// mounts client-side (inside <Canvas>, behind isConnected), so the material
	// is born with its map — no null→texture swap, no shader-recompile timing.
	function createFeltTexture(): THREE.CanvasTexture {
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
		return texture;
	}

	const feltTexture = createFeltTexture();

	// Branding wordmark printed into the felt near a board corner. Its own
	// plane (NOT baked into createFeltTexture — that texture repeats 4x2
	// across the board and would tile the mark 8 times).
	function createWordmarkTexture(): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 1024;
		canvas.height = 256;
		const ctx = canvas.getContext('2d')!;

		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = '600 130px "Helvetica Neue", Arial, sans-serif';
		ctx.fillStyle = '#4c8a68';
		ctx.fillText('table.place', canvas.width / 2, canvas.height / 2 + 8);

		const texture = new THREE.CanvasTexture(canvas);
		texture.anisotropy = 4;
		return texture;
	}

	const wordmarkTexture = createWordmarkTexture();

	onDestroy(() => {
		feltTexture.dispose();
		wordmarkTexture.dispose();
	});
</script>

{#each Object.keys($gameStore?.overlays ?? {}).filter((key) => $gameStore?.overlays?.[key]) as overlayId (overlayId)}
	<OverlayCustom id={overlayId} />
{/each}

<!-- fadeOrigin pinned to table center (default follows the camera, which kept
     the grid strong ~100 units out). Radial fade: solid over the felt, gone
     ~20 units past the long edge. -->
<Grid
	position.y={TABLE_TOP_Y}
	cellColor="#fff"
	sectionColor="#fff"
	sectionThickness={0}
	cellThickness={0.5}
	fadeOrigin={[0, TABLE_TOP_Y, 0]}
	fadeDistance={50}
	fadeStrength={0.5}
	infiniteGrid
/>
<T.Group position={[0, 0, 0]}>
	<T.Mesh receiveShadow bind:ref={mesh} onpointerup={handleDragEnd}>
		<T.BoxGeometry args={[60, 0.5, 30]} />
		<!-- one stable material with its map from birth.
		     (swapping whole materials via {#if}+<T is> detaches without reattaching in threlte 8.5) -->
		<T.MeshStandardMaterial
			map={feltTexture}
			roughness={0.9}
			metalness={0}
			bumpMap={feltTexture}
			bumpScale={0.02}
			side={THREE.DoubleSide}
		/>
	</T.Mesh>
	<!-- printed felt wordmark: not a raycast target (compute() in TableScene
	     only intersects the table mesh above), no pointer handlers, so it
	     can never intercept a drag/drop. -->
	<T.Mesh position={[9, 0.256, -4.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
		<T.PlaneGeometry args={[5, 1.25]} />
		<T.MeshStandardMaterial
			map={wordmarkTexture}
			transparent
			opacity={0.22}
			depthWrite={false}
			roughness={1}
			metalness={0}
			side={THREE.DoubleSide}
		/>
	</T.Mesh>
</T.Group>
