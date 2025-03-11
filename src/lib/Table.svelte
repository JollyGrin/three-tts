<script lang="ts">
	import { T } from '@threlte/core';
	import { RigidBody, Collider } from '@threlte/rapier';
</script>

<T.Group position={[0, 0, 0]}>
	<RigidBody type="fixed">
		<!-- Table surface -->
		<Collider shape="cuboid" args={[30, 0.256, 15]} friction={1} restitution={1}>
			<T.Mesh receiveShadow>
				<T.BoxGeometry args={[60, 0.5, 30]} />
				<T.MeshStandardMaterial color="#35654d" />
			</T.Mesh>
		</Collider>
	</RigidBody>
</T.Group>
