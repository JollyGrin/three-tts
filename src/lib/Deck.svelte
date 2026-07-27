<script lang="ts">
	import * as THREE from 'three';
	import { T } from '@threlte/core';
	import { Text, Billboard, ImageMaterial } from '@threlte/extras';
	import type { IntersectionEvent } from '@threlte/extras';
	import { Spring } from 'svelte/motion';
	import { dragStart, dragStore, setDeckHover } from '$lib/store/dragStore.svelte';
	import {
		CARD_DRAG_Y,
		CARD_WIDTH,
		CARD_HEIGHT,
		DECK_ARM_COLOR,
		DECK_ARM_LIFT,
		DECK_MOVE_HOLD_MS,
		deckBodyGeometry,
		deckHeightForCount
	} from '$lib/utils/constants-cards';
	import { createDeckEdgeTexture, deckEdgeRepeatY } from '$lib/utils/deck-edge-texture';
	import { browser } from '$app/environment';
	import { gameStore } from './store/game/gameStore.svelte';
	import { gameActions } from './store/game/actions';
	import { resolveCardImage, sheetRefCache, CARD_BACK_DEFAULT } from '$lib/packs';
	import { claimPointerDown } from '$lib/utils/single-hit-dispatch';
	import { DRAG_THRESHOLD_PX } from '$lib/utils/counter-input';
	import DropFootprint from './drop/DropFootprint.svelte';
	import { selectedDeckId, DECK_SELECT_COLOR } from '$lib/store/deckSelection';

	// No interactivity() here on purpose. It calls setContext, so a per-deck call
	// would shadow TableScene's context — the handlers below would raycast with
	// the default compute instead of TableScene's (no intersectionPoint, no
	// table-plane fallback) and stopPropagation could never reach a card. They
	// register into TableScene's one context instead.
	let { id = '' }: { id: string } = $props();

	const deck = $derived($gameStore?.decks?.[id] ?? {});
	const deckBackImage = $derived($gameStore?.decks?.[id].deckBackImageUrl ?? CARD_BACK_DEFAULT);

	const cards = $derived($gameStore?.decks?.[id]?.cards ?? []);
	const position: [number, number, number] = $derived(deck.position ?? [0, 0, 0]);
	const rotation: [number, number, number] = $derived(deck.rotation ?? [0, 0, 0]);
	const isFaceUp = $derived(deck.isFaceUp ?? false); // true = cards[0] is top, false = cards[cards.length - 1] is top
	// the element, not just the array, can be missing: a pack may declare a deck
	// with no cards (the tbpp schema allows it) and spawn it empty
	const lastCardImage = $derived(cards?.[0]?.faceImageUrl ?? '');
	const displayedImage = $derived(
		resolveCardImage(isFaceUp ? lastCardImage : deckBackImage, $sheetRefCache)
	);

	// body height tracks how many cards are in the stack (clamped)
	const height = $derived(deckHeightForCount(cards?.length ?? 0));

	// Stacked-card-edge look for the sides: per-deck texture clone so repeat.y
	// can track this deck's height (stripes stay one-card-thick as the deck
	// shrinks). Materials stay UNLIT — side faces must never go black under the
	// current lighting rig; the stripes supply the depth cue instead.
	const edgeTexture = browser ? createDeckEdgeTexture() : null;
	// ExtrudeGeometry has two material groups: 0 = top/bottom lids, 1 = side walls
	const bodyMaterials = [
		new THREE.MeshBasicMaterial({ color: '#e2dfd2' }),
		new THREE.MeshBasicMaterial(edgeTexture ? { map: edgeTexture } : { color: '#e2dfd2' })
	];
	$effect(() => {
		if (edgeTexture) edgeTexture.repeat.y = deckEdgeRepeatY(height);
	});

	const isHovered = $derived(id === $dragStore.isDeckHovered);
	// the scenario editor's "you are positioning THIS one" outline — set only by
	// /setup's pane, so it never draws in /play (see store/deckSelection)
	const isSelected = $derived(id === $selectedDeckId);
	// dropping here replaces the table landing entirely, so the deck has to be
	// the cue — the drop indicator suppresses its table footprint while hovered.
	// Cards only: a dragged deck or piece just settles on the felt (see
	// resolveDrop), so lighting up would promise a landing that can't happen —
	// and the deck being dragged is always hovered by its own pointer.
	const isDragged = $derived($dragStore.isDragging === id);
	const isDropTarget = $derived(
		isHovered &&
			!!$dragStore.isDragging &&
			!$dragStore.isDragging.startsWith('deck:') &&
			!$dragStore.isDragging.startsWith('piece:')
	);

	// Lift + glide springs, same rig as Piece.svelte: the local drag snaps XZ
	// instantly (a spring there reads as input lag), remote decks glide toward
	// the ~200ms-throttled store position instead of teleporting between ticks.
	const lift = new Spring(position[1] ?? 0, {
		stiffness: 0.28,
		damping: 0.7,
		precision: 0.0001
	});
	$effect(() => {
		lift.target = isDragged
			? CARD_DRAG_Y
			: (deck.position?.[1] ?? 0) + (moveArmed ? DECK_ARM_LIFT : 0);
	});

	const planar = new Spring(
		{ x: position[0] ?? 0, z: position[2] ?? 0 },
		{ stiffness: 0.15, damping: 0.8, precision: 0.0001 }
	);
	$effect(() => {
		const [x = 0, , z = 0] = deck.position ?? [];
		if (isDragged) planar.set({ x, z }, { instant: true });
		else planar.target = { x, z };
	});

	// Shuffle wiggle: a decaying yaw twitch, kicked whenever `shuffledAt`
	// changes — the reorder patch alone is invisible from the back, so this is
	// what tells everyone (shuffler included) a shuffle happened. Low damping
	// on purpose: the spring overshoots a few times, which reads as a riffle.
	const wiggle = new Spring(0, { stiffness: 0.3, damping: 0.15, precision: 0.001 });
	// null = not seeded yet: the first run only records, so a late joiner
	// doesn't replay a shuffle that happened before they arrived
	let prevShuffledAt: number | null | undefined = null;
	$effect(() => {
		const t = deck.shuffledAt;
		const prev = prevShuffledAt;
		prevShuffledAt = t;
		if (prev === null || t === undefined || t === prev) return;
		wiggle.set(0.3, { instant: true });
		wiggle.target = 0;
	});

	let pendingDrag: { x: number; y: number; t: number } | null = null;
	let armTimer: ReturnType<typeof setTimeout> | null = null;
	// Long press elapsed with the pointer still down: the pile is armed to
	// move. $state because it is also the cue — the deck lifts DECK_ARM_LIFT
	// and wears the amber outline while armed. The timer only DRAWS the cue
	// and suppresses the tap-draw; the draw-vs-move decision itself is made
	// from event timestamps in onPendingMove, because pointermove delivery is
	// rAF-aligned — on a slow-framed client a quick drag's first move can
	// arrive AFTER the 400ms timer even though the finger moved instantly,
	// and wall-clock arming would misread that drag as a pile move.
	let moveArmed = $state(false);
	// A gesture that stopped being a tap must do NOTHING extra on release:
	// threlte's click fires on pointerdown+pointerup DISPLACEMENT (e.delta),
	// not path length, so both a long press that never travelled AND a drag
	// that wandered and released back over its own start pixel (drawing a
	// card off the top and dropping it back on the pile does exactly this)
	// would otherwise read as a tap and draw a card nobody asked for.
	let suppressClick = false;

	// The tap / drag / long-press disambiguation (tableplace-103). Pointerdown
	// only arms the gesture; what it becomes is decided here:
	//  - travel before the hold elapses → draw the top card INTO the drag: the
	//    card spawns under the pointer and dragStart hands it the in-flight
	//    gesture (the pipeline is store-driven — TableScene streams position to
	//    whatever id isDragging — so ownership transfer is just the id swap)
	//  - travel after the hold armed the move → drag the whole pile, as before
	//  - release without travel → the click handler draws 1 (or, if the hold
	//    armed first, nothing at all)
	function onPendingMove(ne: PointerEvent) {
		if (!pendingDrag) return;
		if (Math.hypot(ne.clientX - pendingDrag.x, ne.clientY - pendingDrag.y) < DRAG_THRESHOLD_PX)
			return;
		// Event time, not wall clock: timeStamp carries when the input HAPPENED,
		// so a threshold-crossing move that sat in the queue behind a long
		// SwiftShader/low-FPS frame still reads as the quick drag it was.
		const heldLong = ne.timeStamp - pendingDrag.t >= DECK_MOVE_HOLD_MS;
		// past the threshold this is a drag, whatever pixel it ends on — the
		// click that follows the eventual release must not also draw
		suppressClick = true;
		cancelPendingDrag();
		// an empty deck has nothing to draw — moving the slab is the only drag
		if (heldLong || (cards?.length ?? 0) === 0) {
			// origin (pre-lift store position) is what Esc returns the deck to
			dragStart(id, CARD_DRAG_Y, deck.position);
			return;
		}
		// the last raycast already put the pointer's table point in the store,
		// so the card materialises exactly under the cursor at drag height
		const point = $dragStore.intersectionPoint;
		const cardId = gameActions.drawIntoDrag(id, point ? [point.x, point.z] : undefined);
		// no origin: a card drawn out of a deck has no table position for Esc
		// to return to — cancel settles it where it floats (see cancelActiveDrag)
		if (cardId) dragStart(cardId, CARD_DRAG_Y);
	}

	// touch: the browser answers a long press with its context menu (and some
	// platforms with a text-selection callout); while a deck gesture is live
	// that press belongs to the table
	function blockContextMenu(e: Event) {
		e.preventDefault();
	}

	function cancelPendingDrag() {
		pendingDrag = null;
		moveArmed = false;
		if (armTimer) {
			clearTimeout(armTimer);
			armTimer = null;
		}
		window.removeEventListener('pointermove', onPendingMove);
		window.removeEventListener('pointerup', cancelPendingDrag);
		window.removeEventListener('pointercancel', cancelPendingDrag);
		window.removeEventListener('contextmenu', blockContextMenu);
	}

	$effect(() => cancelPendingDrag);

	function handlePointerDown(e: IntersectionEvent<PointerEvent>) {
		// claims the pointerdown ahead of anything behind the deck — see
		// claimPointerDown — and locks OrbitControls out of the gesture
		if (!claimPointerDown(e)) return;
		pendingDrag = {
			x: e.nativeEvent.clientX,
			y: e.nativeEvent.clientY,
			t: e.nativeEvent.timeStamp
		};
		suppressClick = false;
		moveArmed = false;
		armTimer = setTimeout(() => {
			armTimer = null;
			moveArmed = true; // the cue mounts; the next travel moves the pile
			suppressClick = true; // and a travel-less release must not draw
		}, DECK_MOVE_HOLD_MS);
		window.addEventListener('pointermove', onPendingMove);
		window.addEventListener('pointerup', cancelPendingDrag);
		// touch long-press can end in pointercancel when the browser reclaims
		// the gesture — clean up the same way a release would
		window.addEventListener('pointercancel', cancelPendingDrag);
		window.addEventListener('contextmenu', blockContextMenu);
	}

	// a press that never travelled: the draw (one card off the top, landing in
	// front of the deck) — unless it was a long press, which draws nothing
	function handleClick(e: IntersectionEvent<MouseEvent>) {
		if (e.delta > DRAG_THRESHOLD_PX) return; // was a drag, not a click
		e.stopPropagation();
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		gameActions.drawFromTop(id);
	}
</script>

<!-- the store id, mirrored onto the object3D: what makes an entity findable in
     the scene graph — by devtools, and by the headless harness, which has to
     know where a thing actually draws in order to click it -->
<T.Group
	name={id}
	position={[planar.current.x, lift.current, planar.current.z]}
	rotation={[rotation[0], rotation[1] + wiggle.current, rotation[2]]}
	onpointerdown={handlePointerDown}
	onclick={handleClick}
	onpointerenter={() => setDeckHover(id)}
	onpointerleave={() => setDeckHover(null)}
>
	<Billboard>
		<Text
			fontSize={0.5}
			text={(cards ?? [])?.length?.toString() ?? '0'}
			position={[0, 1.75, 0]}
			anchorX="center"
		/>
	</Billboard>
	{#if cards?.length > 0}
		{#key displayedImage}
			<T.Mesh castShadow receiveShadow rotation.x={-Math.PI / 2} position.y={height / 2 + 0.01}>
				<T.PlaneGeometry args={[1.4, 2]} />
				<ImageMaterial url={displayedImage} side={2} radius={0.1} opacity={isHovered ? 0.8 : 1} />
			</T.Mesh>
		{/key}
	{/if}

	<!-- PRELOAD THE NEXT DISCARD IMAGE -->
	{#if isFaceUp && cards.length > 1}
		{@const preloadUrl = resolveCardImage(cards[1]?.faceImageUrl, $sheetRefCache)}
		{#key preloadUrl}
			<T.Mesh>
				<T.PlaneGeometry args={[0, 0]} />
				<ImageMaterial url={preloadUrl} side={2} radius={0.1} opacity={0} />
			</T.Mesh>
		{/key}
	{/if}

	<!-- Editing outline: a hair wider than the drop footprint and drawn above
	     it, so a deck that is both selected and a drop target still reads as
	     both. depthTest={false} for the same reason the drop cue disables it —
	     at a low camera angle the deck's own body would swallow it. -->
	{#if isSelected}
		<T.Group rotation.x={-Math.PI / 2} position.y={height / 2 + 0.05}>
			<DropFootprint
				shape="rect"
				w={CARD_WIDTH + 0.5}
				h={CARD_HEIGHT + 0.5}
				color={DECK_SELECT_COLOR}
				fill={0.08}
				border={0.07}
				depthTest={false}
			/>
		</T.Group>
	{/if}

	<!-- Armed-for-move cue (tableplace-103): a long press lifts the deck
	     DECK_ARM_LIFT and mounts this amber outline, so "the next travel moves
	     the pile" is visible before the player commits to the gesture. Amber to
	     stay distinct from the cyan drop cue and the violet editor selection. -->
	{#if moveArmed}
		<T.Group rotation.x={-Math.PI / 2} position.y={height / 2 + 0.04}>
			<DropFootprint
				shape="rect"
				w={CARD_WIDTH + 0.3}
				h={CARD_HEIGHT + 0.3}
				color={DECK_ARM_COLOR}
				fill={0.15}
				border={0.08}
				depthTest={false}
			/>
		</T.Group>
	{/if}

	{#if isDropTarget}
		<T.Group rotation.x={-Math.PI / 2} position.y={height / 2 + 0.03}>
			<DropFootprint
				shape="rect"
				w={CARD_WIDTH + 0.3}
				h={CARD_HEIGHT + 0.3}
				color="#5ee7ff"
				fill={0.15}
				border={0.08}
				depthTest={false}
			/>
		</T.Group>
	{/if}

	<!-- deck body: rounded slab (matches the top image's corner radius) whose
	     sides wear the stacked-card-edge stripes. Unit-height shared geometry,
	     scaled to this deck's height; dispose={false} keeps one deck's unmount
	     from destroying the shared geometry for everyone. -->
	<T.Mesh scale.y={height} material={bodyMaterials}>
		<T is={deckBodyGeometry} attach="geometry" dispose={false} />
	</T.Mesh>
</T.Group>
