<script lang="ts">
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { T } from '@threlte/core';
	import { objectStore } from './store/objectStore.svelte';
	import { ImageMaterial } from '@threlte/extras';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';

	const intersectionPoint = $derived($dragStore.intersectionPoint);
</script>

{#if intersectionPoint}
	<T.Mesh position={[intersectionPoint.x, intersectionPoint.y, intersectionPoint.z]}>
		{#if $dragStore.isDragging}
			{@const card = $objectStore[$dragStore.isDragging]}
			<T.Mesh position.y={0.01} rotation.x={-Math.PI / 2} rotation.z={-card.rotation[2] * DEG2RAD}>
				<T.PlaneGeometry args={[1.4, 2]} />
				<ImageMaterial
					url={card?.faceImageUrl}
					side={0}
					radius={0.1}
					transparent={true}
					opacity={0.2}
				/>
			</T.Mesh>
		{/if}
		<T.SphereGeometry args={[0.1, 32, 16]} />
		<T.MeshBasicMaterial color="#ff0000" depthTest={false} />
	</T.Mesh>
{/if}
