<script lang="ts">
	import { T } from '@threlte/core';
	import { RigidBody, Collider } from '@threlte/rapier';
	import { Grid } from '@threlte/extras';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
</script>

<T.Group position.x={-0.5}>
	<T.Mesh receiveShadow position.y={0.259} position.x={9.5} rotation.x={-DEG2RAD * 90} side={0}>
		<T.PlaneGeometry args={[3, 12]} />
		<T.MeshBasicMaterial color="#7c9488" />
	</T.Mesh>

	<Grid
		scale={3}
		fadeDistance={1000}
		fadeStrength={0}
		position.y={0.2569}
		position.x={2}
		cellSize={1}
		cellThickness={3}
		gridSize={[6, 4]}
		sectionSize={0}
	/>
</T.Group>
