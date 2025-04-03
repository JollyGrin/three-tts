<script lang="ts">
	import { T } from '@threlte/core';
	import { Text, Billboard, ImageMaterial } from '@threlte/extras';
	import { deckStore } from '$lib/store/deckStore.svelte';

	let {
		id = ''
	}: {
		id: string;
	} = $props();

	const deck = $derived($deckStore[id] ?? {});
	const position = $derived(deck.position ?? [0, 0, 0]);
	const rotation = $derived(deck.rotation ?? [0, 0, 0]);
	const isFaceUp = $derived(deck.isFaceUp ?? false); // true = cards[0] is top, false = cards[cards.length - 1] is top
	const lastCardImage = $derived(deck?.cards?.[0].faceImageUrl ?? '');
	const displayedImage = $derived(isFaceUp ? lastCardImage : '/s-back.jpg');
</script>

<T.Group {position} {rotation}>
	<Billboard>
		<Text
			fontSize={0.5}
			text={(deck.cards ?? []).length.toString()}
			position={[0, 1.75, 0]}
			anchorX="center"
		/>
	</Billboard>
	<T.Mesh castShadow receiveShadow rotation.x={-Math.PI / 2} position.y={0.205}>
		<T.PlaneGeometry args={[1.4, 2]} />
		<ImageMaterial url={displayedImage} side={2} radius={0.1} />
	</T.Mesh>
	<T.Mesh>
		<T.BoxGeometry args={[1.4, 0.4, 2]} />
		<T.MeshBasicMaterial color="black" />
	</T.Mesh>
</T.Group>
