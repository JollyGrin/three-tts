<!-- hdr-sky -->
<!-- https://cumuloworks.gumroad.com/l/cwhdrivol1 -->

<script lang="ts">
	import { useLoader } from '@threlte/core';
	import { Environment } from '@threlte/extras';
	import { EquirectangularReflectionMapping } from 'three';
	import { RGBELoader } from 'three/examples/jsm/Addons.js';
	import { getStaticResourceUrl } from './utils/image';

	const { load } = useLoader(RGBELoader);
	// const promise = load(getStaticResourceUrl('/rock-hill2.hdr'), {
	// 	transform(texture) {
	// 		texture.mapping = EquirectangularReflectionMapping;
	// 		return texture;
	// 	}
	// });
</script>

<!-- {#await promise then texture} -->
<!-- 	<Environment {texture} isBackground ground={{ height: 3, radius: 40 }} /> -->
<!-- {/await} -->
