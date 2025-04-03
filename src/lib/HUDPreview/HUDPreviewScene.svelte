<script lang="ts">
	import { T } from '@threlte/core';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { useViewport, interactivity } from '@threlte/extras';
	import PreviewCard from './PreviewCard.svelte';

	interactivity();
	let {}: {} = $props();

	const viewport = useViewport();

	const trayWidth = $derived($viewport.width / 2);
	const trayHeight = $derived($viewport.height / 2); // Adjust height as needed
	const trayX = $derived(-$viewport.width / 2 + trayWidth / 2);
	const trayY = $derived(-$viewport.height / 2 + trayHeight / 2);
</script>

<T.OrthographicCamera makeDefault zoom={80} position={[0, 0, 10]} />
<T.AmbientLight intensity={Math.PI / 2} />
<T.PointLight position={[10, 10, 10]} decay={0} intensity={Math.PI * 2} />

{#if !!$dragStore.isHovered && $dragStore.isPreview}
	<T.Group position={[-trayX, trayY, 0] as [number, number, number]}>
		<PreviewCard id={$dragStore.isHovered ?? ''} />
	</T.Group>
{/if}
