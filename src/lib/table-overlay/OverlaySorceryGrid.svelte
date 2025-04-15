<script lang="ts">
	import { T } from '@threlte/core';
	import { ImageMaterial } from '@threlte/extras';
</script>

<T.Group position.y={0.255}>
	<T.Mesh castShadow receiveShadow rotation.x={-Math.PI / 2} scale={12}>
		<T.PlaneGeometry args={[1.24, 1]} />
		<ImageMaterial url={'/sorcery-grid.png'} side={0} radius={0.1} />
	</T.Mesh>
</T.Group>
