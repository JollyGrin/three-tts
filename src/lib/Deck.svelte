<script lang="ts">
	import * as THREE from 'three';
	import { T } from '@threlte/core';
	import { Text, Billboard, ImageMaterial, interactivity } from '@threlte/extras';
	import { dragStart, dragStore, setDeckHover } from '$lib/store/dragStore.svelte';
	import { degrees } from '$lib/utils/constants-rotation';
	import { CARD_DRAG_Y, CARD_WIDTH, CARD_HEIGHT } from '$lib/utils/constants-cards';
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
	const lastCardImage = $derived(cards?.[0].faceImageUrl ?? '');
	const displayedImage = $derived(
		resolveCardImage(isFaceUp ? lastCardImage : deckBackImage, $sheetRefCache)
	);

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
			<T.Mesh castShadow receiveShadow rotation.x={-Math.PI / 2} position.y={0.21}>
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
		<T.Group rotation.x={-Math.PI / 2} position.y={0.23}>
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

	<!-- deck body: reads as a stack of card edges, not a black slab -->
	<T.Mesh>
		<T.BoxGeometry args={[1.38, 0.4, 1.98]} />
		<T.MeshBasicMaterial color="#e2dfd2" />
	</T.Mesh>
</T.Group>
