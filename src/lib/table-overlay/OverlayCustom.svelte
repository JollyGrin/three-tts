<script lang="ts">
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { T } from '@threlte/core';
	import { ImageMaterial } from '@threlte/extras';
	import { loadTextureImage } from '$lib/utils/image-cors';

	const FLOOR_HEIGHT = 0.255;

	let { id = '' }: { id: string } = $props();
	const overlay = $derived($gameStore.overlays?.[id]);

	// resolved through the CORS fallback; null until loaded, stays null on dead links
	let resolvedUrl = $state<string | null>(null);
	let ratio = $state(1);

	$effect(() => {
		const url = overlay?.imageUrl ?? '';
		resolvedUrl = null;
		if (!url) return;
		let cancelled = false;
		loadTextureImage(url).then((loaded) => {
			if (cancelled || !loaded) return;
			ratio = loaded.width / loaded.height;
			resolvedUrl = loaded.url;
		});
		return () => {
			cancelled = true;
		};
	});

	// plane is aspect-normalized (height 1); overlay.scale = world height
	const worldScale = $derived(overlay?.scale ?? 12);
</script>

{#if resolvedUrl}
	<T.Group position={overlay?.position ?? [0, FLOOR_HEIGHT, 0]} rotation={overlay?.rotation}>
		<T.Mesh receiveShadow rotation.x={-Math.PI / 2} scale={worldScale}>
			<T.PlaneGeometry args={[ratio, 1]} />
			<ImageMaterial url={resolvedUrl} side={0} radius={0.02} />
		</T.Mesh>
	</T.Group>
{/if}
