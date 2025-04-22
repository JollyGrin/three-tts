<script lang="ts">
	import * as THREE from 'three';
	import { T } from '@threlte/core';
	import { Text, Billboard, ImageMaterial, interactivity } from '@threlte/extras';
	import { dragStart, dragStore, setDeckHover } from '$lib/store/dragStore.svelte';
	import { degrees } from '$lib/utils/constants-rotation';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { getStaticResourceUrl } from './utils/image';
	import { gameStore } from './store/game/gameStore.svelte';
	import { gameActions } from './store/game/actions';

	interactivity();

	let { id = '' }: { id: string } = $props();

	// const deckBackImage = getStaticResourceUrl('/s-back.jpg');
	const deck = $derived($gameStore?.decks?.[id] ?? {});
	const deckBackImage = $derived(
		$gameStore?.decks?.[id].deckBackImageUrl ?? getStaticResourceUrl('/s-back.jpg')
	);

	const cards = $derived($gameStore?.decks?.[id]?.cards ?? []);
	const position: [number, number, number] = $derived(deck.position ?? [0, 0, 0]);
	const rotation: [number, number, number] = $derived(deck.rotation ?? [0, 0, 0]);
	const isFaceUp = $derived(deck.isFaceUp ?? false); // true = cards[0] is top, false = cards[cards.length - 1] is top
	const lastCardImage = $derived(cards?.[0].faceImageUrl ?? '');
	const displayedImage = $derived(isFaceUp ? lastCardImage : deckBackImage);

	const isHovered = $derived(id === $dragStore.isDeckHovered);

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
					position: [x, 2.5, z],
					rotation: [rotX, rotY, rotZ],
					backImageUrl: card.backImageUrl ?? deckBackImage
				}
			}
		});

		dragStart(card.id, 2.5);
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
		<T.Mesh castShadow receiveShadow rotation.x={-Math.PI / 2} position.y={0.205}>
			<T.PlaneGeometry args={[1.4, 2]} />
			{#key displayedImage}
				<ImageMaterial url={displayedImage} side={2} radius={0.1} opacity={isHovered ? 0.8 : 1} />
			{/key}
		</T.Mesh>
	{/if}

	<!-- PRELOAD THE NEXT DISCARD IMAGE -->
	{#if isFaceUp && cards.length > 1}
		<T.Mesh>
			<T.PlaneGeometry args={[0, 0]} />
			{#key cards[1]?.faceImageUrl}
				<ImageMaterial url={cards[1]?.faceImageUrl} side={2} radius={0.1} opacity={0} />
			{/key}
		</T.Mesh>
	{/if}

	<T.Mesh>
		<T.BoxGeometry args={[1.4, 0.4, 2]} />
		<T.MeshBasicMaterial color="black" />
	</T.Mesh>
</T.Group>
