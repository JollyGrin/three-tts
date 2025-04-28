<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { dragStart, dragStore } from './store/dragStore.svelte';
	import { Spring } from 'svelte/motion';
	import { ImageMaterial } from '@threlte/extras';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { degrees } from '$lib/utils/constants-rotation';
	import { gameStore } from './store/game/gameStore.svelte';
	import type { GameDTO } from './store/game/types';
	import { gameActions } from './store/game/actions';
	import CardHtmlUnmatched from './patch/unmatched/card/CardHTMLUnmatched.svelte';
	type Vec3Array = [number, number, number];

	let { id, isUnmatched = false }: { id: string; isUnmatched?: boolean } = $props();

	let card: THREE.Mesh | undefined = $state();
	const initCardState: GameDTO['cards'][string] = {
		faceImageUrl: '',
		backImageUrl: '',
		position: [0, 0, 0],
		rotation: [0, 0, 0]
	};

	const isDragging = $derived($dragStore.isDragging === id);
	const cardState = $derived($gameStore?.cards?.[id] ?? initCardState);
	const faceImageUrl = $derived(cardState?.faceImageUrl);
	const backImageUrl = $derived(cardState?.backImageUrl);
	let isHovered = $state(false);
	let emissiveIntensity = $state(0);

	const height = new Spring((cardState?.position as Vec3Array)?.[1] ?? 0.26, {
		stiffness: 0.15,
		damping: 0.7,
		precision: 0.0001
	});

	$effect(() => {
		const newY = cardState?.position?.[1];
		if (!newY) return;
		if (!isDragging && height.current !== newY) height.target = newY;
	});

	const rotation = new Spring((cardState?.rotation as Vec3Array)?.[0] ?? 0, {
		stiffness: 0.1,
		damping: 0.8,
		precision: 0.001
	});

	const seatRotation = $derived(degrees[gameActions.getMySeat()] / DEG2RAD);
	const rotationTap = new Spring(-seatRotation, {
		stiffness: 0.1,
		damping: 0.8,
		precision: 0.001
	});

	// Get base position from store
	const basePosition = $derived(cardState?.position ?? [0, 0, 0]);
	const baseRotation = $derived(cardState?.rotation ?? [0, 0, 0]);

	// Create derived values for each component
	const posX = $derived(basePosition[0]);
	const posY = $derived(height.current);
	const posZ = $derived(basePosition[2]);

	// Combine components into position array
	const position: [number, number, number] = $derived([posX, posY, posZ]);

	// Make card glow when hovered
	$effect(() => {
		emissiveIntensity = isHovered ? 0.1 : 0;
	});

	// Tap card
	$effect(() => {
		rotation.target = baseRotation[0];
		rotationTap.target = baseRotation[2];

		if (!isDragging) {
			// elevate the card if on the table to prevent clipping through
			height.target = 1.5;
			// HACK: double check if this creates a feedback loop
			setTimeout(() => {
				height.target = 0.26;
			}, 350);
		}
	});

	function handleDragStart() {
		dragStart(id, position[1]); // Pass current height

		// Animate to raised height with some extra bounce
		height.target = 2.2;
		setTimeout(() => (height.target = 2), 150);
	}

	function handlePointerEnter() {
		if ($dragStore.isDragging) return;
		isHovered = true;
		$dragStore.isHovered = id;
	}

	function handlePointerLeave() {
		isHovered = false;
		$dragStore.isHovered = null;
	}
</script>

<T.Group
	{position}
	rotation.x={rotation.current * DEG2RAD}
	rotation.y={rotationTap.current * -DEG2RAD}
	onpointerdown={handleDragStart}
	onpointerleave={handlePointerLeave}
	onpointerenter={handlePointerEnter}
>
	<T.Mesh castShadow receiveShadow bind:ref={card} rotation.x={-Math.PI / 2}>
		<T.PlaneGeometry args={[1.4, 2]} />
		{#if isUnmatched}
			<CardHtmlUnmatched {id} />
		{:else}
			{#key faceImageUrl}
				<ImageMaterial
					url={faceImageUrl ?? ''}
					side={0}
					radius={0.1}
					monochromeColor="#fff"
					monochromeStrength={emissiveIntensity}
				/>
			{/key}
		{/if}
	</T.Mesh>

	{#if backImageUrl}
		<T.Mesh castShadow receiveShadow rotation.x={-DEG2RAD * 270} position.y={-0.002}>
			<T.PlaneGeometry args={[1.4, 2]} />
			<ImageMaterial
				url={backImageUrl}
				side={0}
				radius={0.1}
				monochromeColor="#fff"
				monochromeStrength={emissiveIntensity}
			/>
		</T.Mesh>
	{:else}
		<T.Mesh rotation.x={Math.PI / 2} position.y={-0.002} sides={0}>
			<T.PlaneGeometry args={[1.4, 2]} />
			<T.MeshBasicMaterial color="white" />
		</T.Mesh>
	{/if}
</T.Group>
