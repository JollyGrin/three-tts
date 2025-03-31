<script lang="ts">
	import { T } from '@threlte/core';
	import { Text, Billboard, ImageMaterial } from '@threlte/extras';
	import { deckStore } from '$lib/store/deckStore.svelte';

	let {
		id = '',
		position = [0, 0, 0],
		rotation = [0, 0, 0],
		isFaceUp = false
	}: {
		id: string;
		position?: [number, number, number];
		rotation?: [number, number, number];
		isFaceUp?: boolean;
	} = $props();

	const deck = $derived($deckStore[id] ?? {});
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
		<ImageMaterial url={'/s-back.jpg'} side={2} radius={0.1} />
	</T.Mesh>
	<T.Mesh>
		<T.BoxGeometry args={[1.4, 0.4, 2]} />
		<T.MeshBasicMaterial color="black" />
	</T.Mesh>
</T.Group>
