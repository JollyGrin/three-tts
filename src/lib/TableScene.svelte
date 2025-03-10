<script lang="ts">
	import { T } from '@threlte/core';
	import { World } from '@threlte/rapier';
	import { OrbitControls } from '@threlte/extras';
	import Table from './Table.svelte';
	import Card from './Card.svelte';
</script>

<T.PerspectiveCamera makeDefault position={[0, 10, 10]} fov={50}>
	<OrbitControls enableDamping maxPolarAngle={Math.PI / 2 - 0.1} />
</T.PerspectiveCamera>

<T.DirectionalLight position={[3, 10, 10]} intensity={1.5} />
<T.AmbientLight intensity={0.5} />

<World>
	<Table />
	<!-- Add some test cards -->
	<Card position={[0, 2, 0]} />
	<Card position={[1, 3, 1]} />
	<Card position={[-1, 4, -1]} />
</World>
