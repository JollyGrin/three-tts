<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { clearHover, dragStart, dragStore, setHover } from './store/dragStore.svelte';
	import { Spring } from 'svelte/motion';
	import { ImageMaterial } from '@threlte/extras';
	import type { IntersectionEvent } from '@threlte/extras';
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
		CARD_DRAG_Y,
		cardBodyGeometry
	} from '$lib/utils/constants-cards';
	import { fanOffset } from '$lib/utils/transforms/stacking';
	import { pickCard } from './store/cardPick';
	import { resolveCardImage, sheetRefCache } from '$lib/packs';
	import { claimPointerDown } from '$lib/utils/single-hit-dispatch';
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

	// Single source of truth for height: entirely derived from this card's own
	// drag ownership and store state, so nothing outside this effect ever
	// writes height.target. That makes an orphaned card impossible — even a
	// handler that misfires and starts a drag this card never actually wins
	// (dragStore.isDragging goes to some other id) leaves isDragging false
	// here, so this effect keeps settling it at restY instead of leaving
	// whatever height a stray handler last poked it to.
	// While dragging: brief overshoot bounce, then settle on CARD_DRAG_Y — the
	// same height the store records mid-drag, so the drop indicator's
	// connector meets the card. Otherwise: stays lifted while a flip is
	// mid-rotation (so the card can't clip the table), settles to the store's
	// stack height once the rotation completes.
	$effect(() => {
		if (isDragging) {
			height.target = CARD_DRAG_Y + 0.2;
			const handle = setTimeout(() => (height.target = CARD_DRAG_Y), 150);
			return () => clearTimeout(handle);
		}
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

	// Hover fan: while the pointer is on any member of a multi-card loose pile,
	// every member cascades up-screen from the top card so its title band
	// shows — the membership preview for `G`, and what tells a loose pile
	// apart from a deck. Purely a render offset: the store keeps the squared-up
	// rest positions, so nothing here touches shared state.
	const fanIndex = $derived($dragStore.hoveredStack?.indexOf(id) ?? -1);
	const fanShift = $derived(
		fanIndex < 0
			? ([0, 0] as [number, number])
			: fanOffset(
					fanIndex,
					$dragStore.hoveredStack?.length ?? 0,
					// ?? 0: a yaw of undefined would land the card at NaN and fling it
					// off the table — a fan is never worth that
					degrees[gameActions.getMySeat()] ?? 0
				)
	);

	$effect(() => {
		const [x = 0, , z = 0] = cardState?.position ?? [];
		const [fanX, fanZ] = fanShift;
		if (isDragging) planar.set({ x, z }, { instant: true });
		else planar.target = { x: x + fanX, z: z + fanZ };
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

	// px the pointer may travel between down and up and still count as a click
	const DRAG_THRESHOLD_PX = 5;
	let pendingDrag: { x: number; y: number } | null = null;

	function liftIntoDrag() {
		// origin is the store position from before the lift, so Esc can put the
		// card back exactly where it was
		dragStart(id, position[1], (cardState?.position as Vec3Array) ?? undefined);
	}

	// Defer the lift until the pointer actually travels: a plain click used to
	// pick the card up and drop it again under the cursor, nudging it for no
	// reason. Same threshold the counter piece uses.
	function onPendingMove(ne: PointerEvent) {
		if (!pendingDrag) return;
		if (Math.hypot(ne.clientX - pendingDrag.x, ne.clientY - pendingDrag.y) < DRAG_THRESHOLD_PX)
			return;
		cancelPendingDrag();
		liftIntoDrag();
	}

	function cancelPendingDrag() {
		pendingDrag = null;
		window.removeEventListener('pointermove', onPendingMove);
		window.removeEventListener('pointerup', cancelPendingDrag);
	}

	$effect(() => cancelPendingDrag);

	function handleDragStart(e: IntersectionEvent<PointerEvent>) {
		// claims the pointerdown for the topmost card in a pile — see
		// claimPointerDown — so the rest of the stack never sees this event
		if (!claimPointerDown(e)) return;
		pendingDrag = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
		window.addEventListener('pointermove', onPendingMove);
		window.addEventListener('pointerup', cancelPendingDrag);
	}

	// A click that never became a drag. Inert unless something registered a
	// handler (only /create does — see store/cardPick.ts).
	function handleClick(e: IntersectionEvent<MouseEvent>) {
		if (e.delta > DRAG_THRESHOLD_PX) return; // was a drag, not a click
		// threlte dispatches click to every hit near → far, same as pointerdown
		// (see claimPointerDown): stop here so overlapping cards pick the topmost
		// rather than whichever happened to be furthest. Not
		// stopImmediatePropagation — the native click is nobody else's problem.
		e.stopPropagation();
		pickCard(id);
	}

	function handlePointerEnter() {
		if (!!$dragStore.isDragging) return;
		isHovered = true;
		// via the store action, not a direct write: it also collects the loose
		// stack this card belongs to, which is what fans
		setHover(id);
	}

	function handlePointerLeave() {
		isHovered = false;
		clearHover(id);
	}
</script>

<!-- the store id, mirrored onto the object3D: what makes an entity findable in
     the scene graph — by devtools, and by the headless harness, which has to
     know where a thing actually draws in order to click it -->
<T.Group
	name={id}
	{position}
	rotation.z={rotation.current * DEG2RAD}
	rotation.y={rotationTap.current * -DEG2RAD}
	onpointerdown={handleDragStart}
	onpointerleave={handlePointerLeave}
	onpointerenter={handlePointerEnter}
	onclick={handleClick}
>
	<!-- card body: visible paper edge between the two faces (unlit so side faces
	     never go black). Rounded to match the face's corner radius — a square box
	     pokes white nubs past the ImageMaterial's alpha-cutout arc. The geometry
	     is shared across all cards: dispose={false} keeps one card's unmount from
	     destroying it for everyone. -->
	<T.Mesh castShadow>
		<T is={cardBodyGeometry} attach="geometry" dispose={false} />
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
