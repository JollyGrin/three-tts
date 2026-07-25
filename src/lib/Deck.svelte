<script lang="ts">
	import * as THREE from 'three';
	import { T } from '@threlte/core';
	import { Text, Billboard, ImageMaterial, interactivity } from '@threlte/extras';
	import { dragStart, dragStore, setDeckHover } from '$lib/store/dragStore.svelte';
	import { degrees } from '$lib/utils/constants-rotation';
	import {
		CARD_DRAG_Y,
		CARD_WIDTH,
		CARD_HEIGHT,
		deckBodyGeometry,
		deckHeightForCount
	} from '$lib/utils/constants-cards';
	import { createDeckEdgeTexture, deckEdgeRepeatY } from '$lib/utils/deck-edge-texture';
	import { browser } from '$app/environment';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { gameStore } from './store/game/gameStore.svelte';
	import { gameActions } from './store/game/actions';
	import { resolveCardImage, sheetRefCache, CARD_BACK_DEFAULT } from '$lib/packs';
	import DropFootprint from './drop/DropFootprint.svelte';

	interactivity();

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
	// dropping here replaces the table landing entirely, so the deck has to be
	// the cue — the drop indicator suppresses its table footprint while hovered
	const isDropTarget = $derived(isHovered && !!$dragStore.isDragging);

	function handleDragStart(e: PointerEvent) {
		e.stopPropagation();
		const { x = 0, z = 0 } = $dragStore.intersectionPoint as THREE.Vector3;
		const card = gameActions.drawFromTop(id);
		if (!card) return console.warn('No card drawn');

		const rotX = isFaceUp ? 0 : 180;
		const rotY = 0;
		const rotZ = -degrees[gameActions?.getMySeat()] / DEG2RAD;
		gameStore.updateState({
			cards: {
				[card.id]: {
					...card,
					position: [x, CARD_DRAG_Y, z],
					rotation: [rotX, rotY, rotZ],
					backImageUrl: card.backImageUrl ?? deckBackImage
				}
			}
		});

		dragStart(card.id, CARD_DRAG_Y);
	}
</script>

<T.Group
	{position}
	{rotation}
	onpointerdown={handleDragStart}
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
