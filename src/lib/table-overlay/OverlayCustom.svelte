<script lang="ts">
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { T } from '@threlte/core';
	import { ImageMaterial } from '@threlte/extras';

	const FLOOR_HEIGHT = 0.255;

	let { id = '' }: { id: string } = $props();
	const overlay = $derived($gameStore.overlays?.[id]);

	let ratio = $state(1);
	let size = $state([1, 1]);

	$effect(() => {
		const img = new Image();
		img.src = overlay?.imageUrl ?? '';
		img.onload = () => {
			ratio = img.width / img.height;
			console.log(`Width: ${img.width}px`);
			console.log(`Height: ${img.height}px`);
			size = [img.width, img.height];
		};
	});
</script>

<T.Group position={overlay?.position ?? [0, FLOOR_HEIGHT, 0]} rotation={overlay?.rotation}>
	<T.Mesh castShadow receiveShadow rotation.x={-Math.PI / 2} scale={overlay?.scale}>
		<T.PlaneGeometry args={size} />
		{#key overlay?.imageUrl}
			<ImageMaterial url={overlay?.imageUrl ?? ''} side={0} radius={0.1} />
		{/key}
	</T.Mesh>
</T.Group>
