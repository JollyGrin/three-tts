<script lang="ts">
	import { T } from '@threlte/core';
	import { AutoColliders } from '@threlte/rapier';
</script>

<T.Group position={[0, 0, 0]}>
	<!-- Table surface -->
	<AutoColliders shape="cuboid">
		<T.Mesh receiveShadow>
			<T.BoxGeometry args={[60, 0.5, 30]} />
			<T.MeshStandardMaterial color="#35654d" />
		</T.Mesh>
	</AutoColliders>
</T.Group>
