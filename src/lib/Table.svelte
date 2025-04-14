<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { dragEnd, dragStore } from './store/dragStore.svelte';
	import { onDestroy } from 'svelte';
	import { Grid } from '@threlte/extras';
	import { gameActions } from './store/game/actions';
	import { gameStore } from './store/game/gameStore.svelte';
	import OverlayCustom from './table-overlay/OverlayCustom.svelte';

	let { mesh = $bindable() }: { mesh?: THREE.Mesh } = $props();
	let feltMaterial: THREE.MeshStandardMaterial | undefined = $state();

	// Handle the tray & deck drop actions here
	function handleDragEnd() {
		if (!$dragStore.isDragging) return;
		const id = $dragStore.isDragging;
		const { faceImageUrl } = gameActions.getCardState($dragStore.isDragging) ?? {};

		if ($dragStore.isTrayHovered) {
			console.log('Storing in hand:', id, faceImageUrl);
			gameActions.moveCardToTray(id, gameActions?.getMe()?.id as string);
		}

		if (!!$dragStore.isDeckHovered) {
			const deckIdHovered = $dragStore.isDeckHovered;
			console.log('Storing in deck', deckIdHovered);
			gameActions.placeOnTopOfDeck(deckIdHovered, id);
		}

		dragEnd();
	}

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

{#each Object.keys($gameStore?.overlays ?? {}) as overlayId (overlayId)}
	<OverlayCustom id={overlayId} />
{/each}

<Grid
	position.y={0.255}
	cellColor="#fff"
	sectionColor="#fff"
	sectionThickness={0}
	cellThickness={0.5}
	infiniteGrid
/>
<T.Group position={[0, 0, 0]}>
	<T.Mesh receiveShadow bind:ref={mesh} onpointerup={handleDragEnd}>
		<T.BoxGeometry args={[60, 0.5, 30]} />
		{#if feltMaterial}
			<T is={feltMaterial} />
		{:else}
			<T.MeshStandardMaterial color="#35654d" />
		{/if}
	</T.Mesh>
</T.Group>
