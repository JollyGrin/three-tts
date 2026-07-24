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
	import {
		CARD_WIDTH,
		CARD_HEIGHT,
		CARD_THICKNESS,
		CARD_REST_Y,
		CARD_DRAG_Y
	} from '$lib/utils/constants-cards';
	import { resolveCardImage, sheetRefCache } from '$lib/packs';
	type Vec3Array = [number, number, number];

	let { id }: { id: string } = $props();

	let card: THREE.Mesh | undefined = $state();
	const initCardState: GameDTO['cards'][string] = {
		faceImageUrl: '',
		backImageUrl: '',
		position: [0, 0, 0],
		rotation: [0, 0, 0]
	};

	const isDragging = $derived($dragStore.isDragging === id);
	const cardState = $derived($gameStore?.cards?.[id] ?? initCardState);
	const faceImageUrl = $derived(resolveCardImage(cardState?.faceImageUrl, $sheetRefCache));
	const backImageUrl = $derived(resolveCardImage(cardState?.backImageUrl, $sheetRefCache));
	let isHovered = $state(false);
	let emissiveIntensity = $state(0);

	// stiffer than the rotation spring so the card is already airborne when the flip starts
	const height = new Spring((cardState?.position as Vec3Array)?.[1] ?? CARD_REST_Y, {
		stiffness: 0.28,
		damping: 0.7,
		precision: 0.0001
	});

	// Single source of truth for resting height: stays lifted while a flip is
	// mid-rotation (so the card can't clip the table), settles to the store's
	// stack height once the rotation completes. Replaces the old setTimeout
	// settle hack and the per-frame sync effect that fought it.
	$effect(() => {
		if (isDragging) return; // drag handlers own the height while dragging
		const flipping = Math.abs(rotation.current - rotation.target) > 2;
		const restY = cardState?.position?.[1] ?? CARD_REST_Y;
		height.target = flipping ? Math.max(1.5, restY) : restY;
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

	// 180 on x = facedown (flipCard convention). The face plane stays mounted so
	// its texture never unloads, but is not rendered — no peeking under the card.
	// Asymmetric on purpose: flipping DOWN keeps the face until the spring passes
	// 90° (edge-on, so the hide is invisible); flipping UP shows it immediately
	// so the art is there for the whole reveal.
	const isFacedown = $derived(baseRotation[0] === 180 && rotation.current > 90);

	// Horizontal glide: remote drags only arrive every ~200ms (network throttle),
	// so x/z spring toward the store position instead of teleporting between
	// ticks. Local drags snap instantly — a spring there reads as input lag.
	const planar = new Spring(
		{
			x: (cardState?.position as Vec3Array)?.[0] ?? 0,
			z: (cardState?.position as Vec3Array)?.[2] ?? 0
		},
		{ stiffness: 0.15, damping: 0.8, precision: 0.0001 }
	);

	$effect(() => {
		const [x = 0, , z = 0] = cardState?.position ?? [];
		if (isDragging) planar.set({ x, z }, { instant: true });
		else planar.target = { x, z };
	});

	// Create derived values for each component
	const posX = $derived(planar.current.x);
	const posY = $derived(height.current);
	const posZ = $derived(planar.current.z);

	// Combine components into position array
	const position: [number, number, number] = $derived([posX, posY, posZ]);

	// Make card glow when hovered
	$effect(() => {
		emissiveIntensity = isHovered ? 0.1 : 0;
	});

	// Flip / tap rotation targets
	$effect(() => {
		rotation.target = baseRotation[0];
		rotationTap.target = baseRotation[2];
	});

	function handleDragStart() {
		dragStart(id, position[1]); // Pass current height

		// Animate to raised height with some extra bounce. Settles on
		// CARD_DRAG_Y — the same height the store records mid-drag, so the drop
		// indicator's connector meets the card instead of stopping short.
		height.target = CARD_DRAG_Y + 0.2;
		setTimeout(() => (height.target = CARD_DRAG_Y), 150);
	}

	function handlePointerEnter() {
		if (!!$dragStore.isDragging) return;
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
	rotation.z={rotation.current * DEG2RAD}
	rotation.y={rotationTap.current * -DEG2RAD}
	onpointerdown={handleDragStart}
	onpointerleave={handlePointerLeave}
	onpointerenter={handlePointerEnter}
>
	<!-- card body: visible paper edge between the two faces (unlit so side faces never go black) -->
	<T.Mesh castShadow>
		<T.BoxGeometry args={[CARD_WIDTH - 0.04, CARD_THICKNESS * 0.92, CARD_HEIGHT - 0.04]} />
		<T.MeshBasicMaterial color="#d9d6c9" />
	</T.Mesh>
	<!-- key the MESH, not the material: threlte 8.5 material swaps on a live
	     mesh detach without reattaching (same bug as the felt table), leaving
	     the default white material. Mesh recreation attaches cleanly. -->
	{#key faceImageUrl}
		<T.Mesh
			castShadow
			receiveShadow
			bind:ref={card}
			visible={!isFacedown}
			rotation.x={-Math.PI / 2}
			position.y={CARD_THICKNESS / 2}
		>
			<T.PlaneGeometry args={[CARD_WIDTH, CARD_HEIGHT]} />
			<ImageMaterial
				url={faceImageUrl ?? ''}
				side={0}
				radius={0.1}
				monochromeColor={'#fff'}
				monochromeStrength={emissiveIntensity}
			/>
		</T.Mesh>
	{/key}

	{#if backImageUrl}
		<!-- rotation.z compensates the width-axis flip so directional backs read upright -->
		{#key backImageUrl}
			<T.Mesh
				castShadow
				receiveShadow
				rotation.x={-DEG2RAD * 270}
				rotation.z={Math.PI}
				position.y={-CARD_THICKNESS / 2}
			>
				<T.PlaneGeometry args={[CARD_WIDTH, CARD_HEIGHT]} />
				<ImageMaterial
					url={backImageUrl}
					side={0}
					radius={0.1}
					monochromeColor={'#fff'}
					monochromeStrength={emissiveIntensity}
				/>
			</T.Mesh>
		{/key}
	{:else}
		<T.Mesh rotation.x={Math.PI / 2} position.y={-CARD_THICKNESS / 2}>
			<T.PlaneGeometry args={[CARD_WIDTH, CARD_HEIGHT]} />
			<T.MeshBasicMaterial color="white" />
		</T.Mesh>
	{/if}
</T.Group>
