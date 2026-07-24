<script lang="ts">
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import type { GameDTO } from '$lib/store/game/types';
	import { T } from '@threlte/core';
	import { ImageMaterial, interactivity } from '@threlte/extras';
	import { resolveCardImage, sheetRefCache } from '$lib/packs';

	interactivity();
	let { id }: { id: string } = $props();
	const card = $derived($gameStore?.cards?.[id] as NonNullable<GameDTO['cards'][string]>);
	const isFlipped = $derived((card?.rotation ?? [0])[0] === 180);

	const cardSize = [1.4 * 1.4, 2 * 1.4];
</script>

{#if !!card}
	<T.Mesh scale={2.75} position.y={1}>
		<T.PlaneGeometry args={cardSize} />
		{@const previewUrl = resolveCardImage(
			isFlipped ? card.backImageUrl : card.faceImageUrl,
			$sheetRefCache
		)}
		{#key previewUrl}
			<ImageMaterial url={previewUrl} side={0} radius={0.3} opacity={1} />
		{/key}
	</T.Mesh>
{/if}
