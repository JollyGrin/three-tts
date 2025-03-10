<script lang="ts">
	import { T } from '@threlte/core';
	import { AutoColliders, RigidBody } from '@threlte/rapier';
</script>

<T.Group>
	<!-- Table surface -->
	<AutoColliders shape="cuboid">
		<T.Mesh position={[0, 0, 0]} receiveShadow>
			<T.BoxGeometry args={[20, 0.5, 20]} />
			<T.MeshStandardMaterial color="#35654d" />
		</T.Mesh>
	</AutoColliders>
</T.Group>
