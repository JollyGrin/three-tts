<script lang="ts">
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { T } from '@threlte/core';
	import { ImageMaterial } from '@threlte/extras';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { gameStore } from './store/game/gameStore.svelte';
	import { faceFor } from './store/game/visibility';
	import { gameActions } from './store/game/actions';

	const myPlayerId = gameActions.getMyId() ?? '';
	const intersectionPoint = $derived($dragStore.intersectionPoint);
</script>

{#if intersectionPoint}
	<T.Mesh position={[intersectionPoint.x, intersectionPoint.y, intersectionPoint.z]}>
		{#if $dragStore.isDragging}
			{@const card = $gameStore?.cards?.[$dragStore.isDragging]}
			{@const rotation = card?.rotation ?? [0, 0, 0]}
			<!-- the drop ghost can only ever show a face this client is entitled
			     to: a hidden card has no faceImageUrl to render -->
			<T.Mesh position.y={0.01} rotation.x={-Math.PI / 2} rotation.z={-rotation[2] * DEG2RAD}>
				<T.PlaneGeometry args={[1.4, 2]} />
				<ImageMaterial
					url={faceFor(card, myPlayerId) ?? ''}
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
