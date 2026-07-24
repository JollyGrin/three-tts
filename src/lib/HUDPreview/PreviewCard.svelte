<script lang="ts">
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import type { GameDTO } from '$lib/store/game/types';
	import { T } from '@threlte/core';
	import { ImageMaterial, interactivity } from '@threlte/extras';
	import { resolveCardImage, sheetRefCache } from '$lib/packs';
	import { canSeeFace } from '$lib/store/game/visibility';
	import { gameActions } from '$lib/store/game/actions';

	interactivity();
	let { id }: { id: string } = $props();
	const myPlayerId = gameActions.getMyId() ?? '';
	const card = $derived($gameStore?.cards?.[id] as NonNullable<GameDTO['cards'][string]>);
	// The preview is where a peeked card pays off: it shows the face you are
	// entitled to even while the card lies facedown on the table. A card you may
	// not see previews as its back — there is no face here to leak.
	const canSee = $derived(canSeeFace(card, myPlayerId));

	const cardSize = [1.4 * 1.4, 2 * 1.4];
</script>

{#if !!card}
	{@const previewUrl = resolveCardImage(
		canSee ? card.faceImageUrl : card.backImageUrl,
		$sheetRefCache
	)}
	{#key previewUrl}
		<T.Mesh scale={2.75} position.y={1}>
			<T.PlaneGeometry args={cardSize} />
			<ImageMaterial url={previewUrl} side={0} radius={0.3} opacity={1} />
		</T.Mesh>
	{/key}
{/if}
