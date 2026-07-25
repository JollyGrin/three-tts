<script lang="ts">
	import { T } from '@threlte/core';
	import { Billboard, Text, ImageMaterial } from '@threlte/extras';
	import type { IntersectionEvent } from '@threlte/extras';
	import { Spring } from 'svelte/motion';
	import { dragStart, dragStore } from './store/dragStore.svelte';
	import { gameStore } from './store/game/gameStore.svelte';
	import { gameActions } from './store/game/actions';
	import { resolveCardImage, sheetRefCache } from '$lib/packs';
	import { claimPointerDown } from '$lib/utils/single-hit-dispatch';
	import { createCounterInput, DRAG_THRESHOLD_PX } from '$lib/utils/counter-input';
	import { setPieceHover, clearPieceHover, openPieceMenu } from '$lib/store/pieceUi';
	import { createDieInput } from '$lib/utils/die-input';
	import Die from './Die.svelte';
	import {
		DIE_SIDES_DEFAULT,
		PIECE_DEFAULT_RADIUS,
		PIECE_DRAG_Y,
		PIECE_RADIUS,
		PIECE_REST_Y,
		PIECE_THICKNESS
	} from '$lib/utils/constants-pieces';

	let { id }: { id: string } = $props();

	const piece = $derived($gameStore?.pieces?.[id]);
	const kind = $derived(piece?.kind ?? 'token');
	const radius = $derived(
		piece?.radius ?? (kind === 'die' ? PIECE_RADIUS.die : PIECE_DEFAULT_RADIUS)
	);
	const color = $derived(piece?.color ?? '#c8c4b8');

	// multi-state piece: the face is whichever state it is showing. `states[0]`
	// is the base face (see PackPieceDef.states), so `imageUrl` only applies to
	// a piece with no states at all.
	//
	// Never a die. States are alternate face *images*; a die's faces are
	// procedural geometry, so a hand-authored pack that puts `states` on one
	// must not give it a state menu, a state name, or an image on top of the
	// numbers. The two concepts are orthogonal and this is where that is kept
	// true — `kind` decides the body, `states` only ever decorates the disc.
	const states = $derived(kind === 'die' ? [] : (piece?.states ?? []));
	const stateIndex = $derived(gameActions.currentPieceState(piece));
	const faceRef = $derived(states.length ? states[stateIndex]?.face : piece?.imageUrl);
	const imageUrl = $derived(resolveCardImage(faceRef, $sheetRefCache));
	const isDragging = $derived($dragStore.isDragging === id);
	let isHovered = $state(false);

	const THICKNESS = PIECE_THICKNESS;
	const REST_Y = PIECE_REST_Y;

	const height = new Spring(piece?.position?.[1] ?? REST_Y, {
		stiffness: 0.28,
		damping: 0.7,
		precision: 0.0001
	});

	// Entirely derived from this piece's own drag ownership and store state —
	// see the matching comment on Card's height effect — so a piece that
	// starts a drag it never actually wins can't stay stuck airborne.
	$effect(() => {
		height.target = isDragging ? PIECE_DRAG_Y : (piece?.position?.[1] ?? REST_Y);
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

	let pendingDrag: { x: number; y: number } | null = null;
	let dragMoved = false;

	function liftIntoDrag() {
		// origin (pre-lift store position) is what Esc returns the piece to
		dragStart(id, position[1], piece?.position as [number, number, number] | undefined);
	}

	/**
	 * Kinds that answer a plain click. They defer the lift until the pointer
	 * actually travels, so clicking adjusts a counter / rolls a die without
	 * picking the piece up and dropping it — while still being draggable.
	 */
	const clickable = $derived(kind === 'counter' || kind === 'die');

	// Counters and dice defer the lift until the pointer actually travels, so a
	// plain click can act without picking the piece up and dropping it.
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
		// claims the pointerdown for the topmost piece in a pile — see
		// claimPointerDown — so the rest of the stack never sees this event
		if (!claimPointerDown(e)) return;
		// left button only: right-click is the state menu (and a counter's heal),
		// and picking the piece up under the menu would drag it as you choose
		if (e.nativeEvent.button !== 0) return;
		if (!clickable) {
			liftIntoDrag();
			return;
		}
		dragMoved = false;
		pendingDrag = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
		window.addEventListener('pointermove', onPendingMove);
		window.addEventListener('pointerup', cancelPendingDrag);
	}

	// click / right-click / wheel on a counter. Lives in counter-input so the
	// one-step-per-input guarantee is unit-tested against Threlte's dispatch
	// loop — a counter group has 2-3 raycastable children and Threlte queues
	// the group once per child the ray pierces (tableplace-84).
	const counterInput = createCounterInput({
		id: () => id,
		isCounter: () => kind === 'counter',
		wasDrag: () => dragMoved,
		increment: gameActions.incrementCounter
	});

	// click-to-roll, guarded the same way and for the same reason. Each input
	// owns its own dispatch guard and bails out before claiming when the piece
	// is not its kind, so exactly one of them ever acts on a given click.
	const dieInput = createDieInput({
		id: () => id,
		isDie: () => kind === 'die',
		wasDrag: () => dragMoved,
		roll: gameActions.rollDie
	});

	function handleClick(e: IntersectionEvent<MouseEvent>) {
		counterInput.onclick(e);
		dieInput.onclick(e);
	}

	/**
	 * Right-click on a multi-state piece opens the state picker instead of the
	 * counter's heal — with more than two faces, cycling is not a control. The
	 * menu itself is DOM (see PieceStateMenu.svelte), so all that happens here
	 * is handing it the pointer position.
	 */
	function handleContextMenu(e: IntersectionEvent<MouseEvent>) {
		if (states.length < 2) return counterInput.oncontextmenu(e);
		e.nativeEvent.preventDefault();
		e.stopPropagation();
		if (e.delta > DRAG_THRESHOLD_PX) return; // was a drag, not a click
		openPieceMenu(id, e.nativeEvent.clientX, e.nativeEvent.clientY);
	}

	function handlePointerEnter() {
		isHovered = true;
		setPieceHover(id); // what the X hotkey acts on
	}

	function handlePointerLeave() {
		isHovered = false;
		clearPieceHover(id);
	}

	$effect(() => () => clearPieceHover(id));

	const label = $derived.by(() => {
		// name the face, not just the piece: with several states that is the only
		// on-table clue which one is showing
		if (kind !== 'counter') {
			const stateName = states.length > 1 ? states[stateIndex]?.name : undefined;
			const name = piece?.name ?? '';
			return stateName ? (name ? `${name} — ${stateName}` : stateName) : name;
		}
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
		onwheel={counterInput.onwheel}
		onpointerenter={handlePointerEnter}
		onpointerleave={handlePointerLeave}
	>
		{#if kind === 'die'}
			<Die
				sides={piece.sides ?? DIE_SIDES_DEFAULT}
				value={piece.value ?? 1}
				rollSeq={piece.rollSeq ?? 0}
				{radius}
				{color}
			/>
		{:else if kind === 'pawn'}
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
