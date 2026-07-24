<script lang="ts">
	import * as THREE from 'three';
	import { T } from '@threlte/core';
	import { Text, Billboard, ImageMaterial, interactivity } from '@threlte/extras';
	import { dragStart, dragStore, setDeckHover } from '$lib/store/dragStore.svelte';
	import { degrees } from '$lib/utils/constants-rotation';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { gameStore } from './store/game/gameStore.svelte';
	import { gameActions } from './store/game/actions';
	import { resolveCardImage, sheetRefCache, CARD_BACK_DEFAULT } from '$lib/packs';
	import { nanoid } from 'nanoid';

	interactivity();

	let { id = '' }: { id: string } = $props();

	const deck = $derived($gameStore?.decks?.[id] ?? {});
	const deckBackImage = $derived($gameStore?.decks?.[id].deckBackImageUrl ?? CARD_BACK_DEFAULT);

	// A facedown deck arrives as a count with no card list — its order and its
	// faces stay on the server. A face-up pile ships only the one card the table
	// can actually see.
	const cards = $derived($gameStore?.decks?.[id]?.cards ?? []);
	const cardCount = $derived(deck.cardCount ?? cards.length);
	const position: [number, number, number] = $derived(deck.position ?? [0, 0, 0]);
	const rotation: [number, number, number] = $derived(deck.rotation ?? [0, 0, 0]);
	const isFaceUp = $derived(deck.isFaceUp ?? false); // true = cards[0] is top, false = cards[cards.length - 1] is top
	const lastCardImage = $derived(cards?.[0]?.faceImageUrl ?? '');
	const displayedImage = $derived(
		resolveCardImage(isFaceUp ? lastCardImage : deckBackImage, $sheetRefCache)
	);

	const isHovered = $derived(id === $dragStore.isDeckHovered);

	// Drawing is a request: the client asks for a card under an id it makes up,
	// and the server fills that id in with whatever was on top. The id is opaque
	// on purpose — `card:alice:main-AS` would announce the card it names.
	function handleDragStart(e: PointerEvent) {
		e.stopPropagation();
		const { x = 0, z = 0 } = $dragStore.intersectionPoint as THREE.Vector3;
		const myPlayerId = gameActions.getMyId();
		if (!myPlayerId) return console.warn('No player id — cannot draw');

		const rotX = isFaceUp ? 0 : 180;
		const rotY = 0;
		const rotZ = -degrees[gameActions?.getMySeat()] / DEG2RAD;
		const placement = {
			cardId: `card:${myPlayerId}:${nanoid(10)}`,
			position: [x, 2.5, z] as [number, number, number],
			rotation: [rotX, rotY, rotZ] as [number, number, number]
		};

		const cardId = gameActions.drawFromTop(id, placement);
		if (!cardId) return console.warn('No card drawn');

		// paint the card being dragged straight away; the face (if we are even
		// entitled to it) arrives with the server's confirmation
		gameStore.updateStateSilently({
			cards: {
				[cardId]: {
					position: placement.position,
					rotation: placement.rotation,
					backImageUrl: deckBackImage,
					visibility: isFaceUp ? { kind: 'public' } : { kind: 'hidden' }
				}
			}
		});

		dragStart(cardId, 2.5);
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
		<Text fontSize={0.5} text={cardCount.toString()} position={[0, 1.75, 0]} anchorX="center" />
	</Billboard>
	{#if cardCount > 0}
		{#key displayedImage}
			<T.Mesh castShadow receiveShadow rotation.x={-Math.PI / 2} position.y={0.21}>
				<T.PlaneGeometry args={[1.4, 2]} />
				<ImageMaterial url={displayedImage} side={2} radius={0.1} opacity={isHovered ? 0.8 : 1} />
			</T.Mesh>
		{/key}
	{/if}

	<!-- PRELOAD THE NEXT DISCARD IMAGE (offline only: online a pile ships just
	     its top card, so there is no next image to warm) -->
	{#if isFaceUp && cards.length > 1}
		{@const preloadUrl = resolveCardImage(cards[1]?.faceImageUrl, $sheetRefCache)}
		{#key preloadUrl}
			<T.Mesh>
				<T.PlaneGeometry args={[0, 0]} />
				<ImageMaterial url={preloadUrl} side={2} radius={0.1} opacity={0} />
			</T.Mesh>
		{/key}
	{/if}

	<!-- deck body: reads as a stack of card edges, not a black slab -->
	<T.Mesh>
		<T.BoxGeometry args={[1.38, 0.4, 1.98]} />
		<T.MeshBasicMaterial color="#e2dfd2" />
	</T.Mesh>
</T.Group>
