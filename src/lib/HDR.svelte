<script lang="ts">
	import { useLoader } from '@threlte/core';
	import { Environment } from '@threlte/extras';
	import { EquirectangularReflectionMapping, TextureLoader } from 'three';
	import { RGBELoader } from 'three/examples/jsm/Addons.js';

	const { load } = useLoader(RGBELoader);
	const promise = load('/hdr-hay.hdr', {
		transform(texture) {
			texture.mapping = EquirectangularReflectionMapping;
			return texture;
		}
	});
</script>

{#await promise then texture}
	<Environment {texture} isBackground />
{/await}
