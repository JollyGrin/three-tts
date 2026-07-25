<script lang="ts">
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import type { GameDTO } from '$lib/store/game/types';
	import { T } from '@threlte/core';
	import { ImageMaterial } from '@threlte/extras';
	import { resolveCardImage, sheetRefCache } from '$lib/packs';

	// The preview is display-only: nothing here registers a pointer handler, so
	// it needs no interactivity context of its own.
	let { id }: { id: string } = $props();
	const card = $derived($gameStore?.cards?.[id] as NonNullable<GameDTO['cards'][string]>);
	const isFlipped = $derived((card?.rotation ?? [0])[0] === 180);

	const cardSize = [1.4 * 1.4, 2 * 1.4];
</script>

{#if !!card}
	{@const previewUrl = resolveCardImage(
		isFlipped ? card.backImageUrl : card.faceImageUrl,
		$sheetRefCache
	)}
	{#key previewUrl}
		<T.Mesh scale={2.75} position.y={1}>
			<T.PlaneGeometry args={cardSize} />
			<ImageMaterial url={previewUrl} side={0} radius={0.3} opacity={1} />
		</T.Mesh>
	{/key}
{/if}
