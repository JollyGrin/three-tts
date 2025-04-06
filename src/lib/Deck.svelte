<script lang="ts">
	import * as THREE from 'three';
	import { T } from '@threlte/core';
	import { Text, Billboard, ImageMaterial, interactivity } from '@threlte/extras';
	import { degrees, seatStore } from '$lib/store/seatStore.svelte';
	import { objectStore } from '$lib/store/objectStore.svelte';
	import { dragStart, dragStore, setDeckHover } from '$lib/store/dragStore.svelte';
	import { deckStore } from '$lib/store/deckStore.svelte';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { getStaticResourceUrl } from './utils/image';

	interactivity();

	let {
		id = ''
	}: {
		id: string;
	} = $props();

	const deckBackImage = getStaticResourceUrl('/s-back.jpg');
	const deck = $derived($deckStore[id] ?? {});
	const position = $derived(deck.position ?? [0, 0, 0]);
	const rotation = $derived(deck.rotation ?? [0, 0, 0]);
	const isFaceUp = $derived(deck.isFaceUp ?? false); // true = cards[0] is top, false = cards[cards.length - 1] is top
	const lastCardImage = $derived(deck?.cards?.[0].faceImageUrl ?? '');
	const displayedImage = $derived(isFaceUp ? lastCardImage : deckBackImage);

	const isHovered = $derived(id === $dragStore.isDeckHovered);

	function handleDragStart(e: PointerEvent) {
		e.stopPropagation();
		const { x = 0, z = 0 } = $dragStore.intersectionPoint as THREE.Vector3;
		const card = deckStore.drawFromTop(id);
		if (!card) return console.warn('No card drawn');

		objectStore.updateCardState(
			card.id,
			[x, 2.5, z],
			card.faceImageUrl,
			[
				isFaceUp ? 0 : 180,
				0,
				-degrees[$seatStore.seat] / DEG2RAD // should be facing the player in seat
			],
			card?.backImageUrl ?? deckBackImage
		);

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
			text={(deck.cards ?? [])?.length?.toString() ?? '0'}
			position={[0, 1.75, 0]}
			anchorX="center"
		/>
	</Billboard>
	{#if deck.cards.length > 0}
		<T.Mesh castShadow receiveShadow rotation.x={-Math.PI / 2} position.y={0.205}>
			<T.PlaneGeometry args={[1.4, 2]} />
			{#key displayedImage}
				<ImageMaterial url={displayedImage} side={2} radius={0.1} opacity={isHovered ? 0.8 : 1} />
			{/key}
		</T.Mesh>
	{/if}

	<!-- PRELOAD THE NEXT DISCARD IMAGE -->
	{#if isFaceUp && deck.cards.length > 1}
		<T.Mesh>
			<T.PlaneGeometry args={[0, 0]} />
			{#key deck?.cards[1]?.faceImageUrl}
				<ImageMaterial url={deck?.cards[1]?.faceImageUrl} side={2} radius={0.1} opacity={0} />
			{/key}
		</T.Mesh>
	{/if}

	<T.Mesh>
		<T.BoxGeometry args={[1.4, 0.4, 2]} />
		<T.MeshBasicMaterial color="black" />
	</T.Mesh>
</T.Group>
