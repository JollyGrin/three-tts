<script lang="ts">
	import { T } from '@threlte/core';
	import { ImageMaterial, interactivity } from '@threlte/extras';
	import { objectStore } from '$lib/store/objectStore.svelte';

	interactivity();
	let { id }: { id: string } = $props();
	const card = $derived($objectStore[id]);
	const isFlipped = $derived(card.rotation[0] === 180);

	const cardSize = [1.4 * 1.4, 2 * 1.4];
</script>

<T.Mesh scale={2.75} position.y={1}>
	<T.PlaneGeometry args={cardSize} />
	<ImageMaterial
		url={isFlipped ? (card.backImageUrl as string) : (card.faceImageUrl as string)}
		side={0}
		radius={0.3}
		opacity={1}
	/>
</T.Mesh>
