<script lang="ts">
	import { T } from '@threlte/core';
	import { ImageMaterial } from '@threlte/extras';

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
</script>

<T.Group {position} {rotation}>
	<T.Mesh castShadow receiveShadow rotation.x={-Math.PI / 2} position.y={0.205}>
		<T.PlaneGeometry args={[1.4, 2]} />
		<ImageMaterial url={'/s-back.jpg'} side={2} radius={0.1} />
	</T.Mesh>
	<T.Mesh>
		<T.BoxGeometry args={[1.4, 0.4, 2]} />
		<T.MeshBasicMaterial color="black" />
	</T.Mesh>
</T.Group>
