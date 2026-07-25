<script lang="ts">
	import { T } from '@threlte/core';
	import { Billboard, Text, ImageMaterial } from '@threlte/extras';
	import type { IntersectionEvent } from '@threlte/extras';
	import { Spring } from 'svelte/motion';
	import { dragStart, dragStore } from './store/dragStore.svelte';
	import { gameStore } from './store/game/gameStore.svelte';
	import { gameActions } from './store/game/actions';
	import { resolveCardImage, sheetRefCache } from '$lib/packs';
	import {
		PIECE_DEFAULT_RADIUS,
		PIECE_DRAG_Y,
		PIECE_REST_Y,
		PIECE_THICKNESS
	} from '$lib/utils/constants-pieces';

	let { id }: { id: string } = $props();

	const piece = $derived($gameStore?.pieces?.[id]);
	const kind = $derived(piece?.kind ?? 'token');
	const radius = $derived(piece?.radius ?? PIECE_DEFAULT_RADIUS);
	const color = $derived(piece?.color ?? '#c8c4b8');
	const imageUrl = $derived(resolveCardImage(piece?.imageUrl, $sheetRefCache));
	const isDragging = $derived($dragStore.isDragging === id);
	let isHovered = $state(false);

	const THICKNESS = PIECE_THICKNESS;
	const REST_Y = PIECE_REST_Y;

	const height = new Spring(piece?.position?.[1] ?? REST_Y, {
		stiffness: 0.28,
		damping: 0.7,
		precision: 0.0001
	});

	$effect(() => {
		if (isDragging) return;
		height.target = piece?.position?.[1] ?? REST_Y;
	});

	// Horizontal glide: remote drags only arrive every ~200ms (network throttle),
	// so x/z spring toward the store position instead of teleporting between
	// ticks. Local drags snap instantly — a spring there reads as input lag.
	const planar = new Spring(
		{ x: piece?.position?.[0] ?? 0, z: piece?.position?.[2] ?? 0 },
		{ stiffness: 0.15, damping: 0.8, precision: 0.0001 }
	);

	$effect(() => {
		const [x = 0, , z = 0] = piece?.position ?? [];
		if (isDragging) planar.set({ x, z }, { instant: true });
		else planar.target = { x, z };
	});

	const position: [number, number, number] = $derived([
		planar.current.x,
		height.current,
		planar.current.z
	]);

	// px the pointer may travel between down and up and still count as a click
	const DRAG_THRESHOLD_PX = 5;

	let pendingDrag: { x: number; y: number } | null = null;
	let dragMoved = false;

	function liftIntoDrag() {
		// origin (pre-lift store position) is what Esc returns the piece to
		dragStart(id, position[1], piece?.position as [number, number, number] | undefined);
		height.target = PIECE_DRAG_Y;
	}

	// Counters defer the lift until the pointer actually travels, so a plain
	// click can adjust the value without picking the piece up and dropping it.
	function onPendingMove(ne: PointerEvent) {
		if (!pendingDrag) return;
		if (Math.hypot(ne.clientX - pendingDrag.x, ne.clientY - pendingDrag.y) < DRAG_THRESHOLD_PX)
			return;
		cancelPendingDrag();
		dragMoved = true;
		liftIntoDrag();
	}

	function cancelPendingDrag() {
		pendingDrag = null;
		window.removeEventListener('pointermove', onPendingMove);
		window.removeEventListener('pointerup', cancelPendingDrag);
	}

	$effect(() => cancelPendingDrag);

	function handlePointerDown(e: IntersectionEvent<PointerEvent>) {
		if (e.nativeEvent.button !== 0) return; // right-click is contextmenu, not drag
		if (kind !== 'counter') {
			liftIntoDrag();
			return;
		}
		// keep OrbitControls from rotating during the pre-threshold pixels
		e.stopImmediatePropagation();
		dragMoved = false;
		pendingDrag = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
		window.addEventListener('pointermove', onPendingMove);
		window.addEventListener('pointerup', cancelPendingDrag);
	}

	function handleClick(e: IntersectionEvent<MouseEvent>) {
		if (kind !== 'counter') return;
		if (dragMoved || e.delta > DRAG_THRESHOLD_PX) return; // was a drag, not a click
		// click deals damage; shift (or alt) heals
		const ne = e.nativeEvent;
		gameActions.incrementCounter(id, ne.shiftKey || ne.altKey ? 1 : -1);
	}

	function handleContextMenu(e: IntersectionEvent<MouseEvent>) {
		if (kind !== 'counter') return;
		e.nativeEvent.preventDefault();
		if (e.delta > DRAG_THRESHOLD_PX) return;
		gameActions.incrementCounter(id, 1);
	}

	// ±1 per wheel notch; accumulate so trackpads don't spray increments
	let wheelAccum = 0;
	const WHEEL_NOTCH = 100;
	function handleWheel(e: IntersectionEvent<WheelEvent>) {
		if (kind !== 'counter') return;
		e.stopImmediatePropagation(); // don't zoom the camera while adjusting
		const ne = e.nativeEvent;
		wheelAccum += ne.deltaMode === 1 ? ne.deltaY * (WHEEL_NOTCH / 3) : ne.deltaY;
		while (wheelAccum >= WHEEL_NOTCH) {
			wheelAccum -= WHEEL_NOTCH;
			gameActions.incrementCounter(id, -1);
		}
		while (wheelAccum <= -WHEEL_NOTCH) {
			wheelAccum += WHEEL_NOTCH;
			gameActions.incrementCounter(id, 1);
		}
	}

	const label = $derived.by(() => {
		if (kind !== 'counter') return piece?.name ?? '';
		const value = piece?.value ?? piece?.maxValue ?? 0;
		return piece?.maxValue != null ? `${value}/${piece.maxValue}` : `${value}`;
	});

	// pulse the label when the value changes (local or remote) so it's noticed
	const labelScale = new Spring(1, { stiffness: 0.15, damping: 0.5, precision: 0.001 });
	let prevValue: number | undefined = undefined;
	$effect(() => {
		const v = piece?.value;
		if (prevValue !== undefined && v !== undefined && v !== prevValue) {
			labelScale.set(1.6, { instant: true });
			labelScale.target = 1;
		}
		prevValue = v;
	});
</script>

{#if piece}
	<T.Group
		{position}
		onpointerdown={handlePointerDown}
		onclick={handleClick}
		oncontextmenu={handleContextMenu}
		onwheel={handleWheel}
		onpointerenter={() => (isHovered = true)}
		onpointerleave={() => (isHovered = false)}
	>
		{#if kind === 'pawn'}
			<!-- procedural pawn: base disc + stem + head -->
			<T.Mesh castShadow position.y={0.06}>
				<T.CylinderGeometry args={[radius * 0.5, radius * 0.6, 0.12, 24]} />
				<T.MeshStandardMaterial {color} />
			</T.Mesh>
			<T.Mesh castShadow position.y={0.45}>
				<T.CylinderGeometry args={[radius * 0.16, radius * 0.3, 0.75, 16]} />
				<T.MeshStandardMaterial {color} />
			</T.Mesh>
			<T.Mesh castShadow position.y={0.95}>
				<T.SphereGeometry args={[radius * 0.32, 20, 16]} />
				<T.MeshStandardMaterial {color} />
			</T.Mesh>
		{:else}
			<!-- token / counter: flat disc, image or color on top -->
			<T.Mesh castShadow>
				<T.CylinderGeometry args={[radius, radius, THICKNESS, 36]} />
				<T.MeshStandardMaterial {color} />
			</T.Mesh>
			{#if imageUrl}
				{#key imageUrl}
					<T.Mesh rotation.x={-Math.PI / 2} position.y={THICKNESS / 2 + 0.002}>
						<T.CircleGeometry args={[radius * 0.96, 36]} />
						<ImageMaterial url={imageUrl} side={0} />
					</T.Mesh>
				{/key}
			{/if}
		{/if}

		{#if label && (kind === 'counter' || isHovered)}
			<Billboard>
				<Text
					text={label}
					fontSize={kind === 'counter' ? 0.55 : 0.35}
					position={[0, kind === 'pawn' ? 1.5 : 0.75, 0]}
					scale={kind === 'counter' ? labelScale.current : 1}
					anchorX="center"
					color="#ffffff"
					outlineWidth={0.02}
					outlineColor="#000000"
				/>
			</Billboard>
		{/if}
	</T.Group>
{/if}
