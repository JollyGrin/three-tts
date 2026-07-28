<!-- rock-hill2: the most neutral of the shipped HDRs — the sky one washes the
     felt cyan, pine overbrightens it (see tableplace-152 for the comparison) -->
<!-- https://cumuloworks.gumroad.com/l/cwhdrivol1 -->

<script lang="ts">
	import { useThrelte } from '@threlte/core';
	import { Environment } from '@threlte/extras';
	import { environmentIntensity } from './store/environment';
	import { getStaticResourceUrl } from './utils/image';

	const { scene, invalidate } = useThrelte();

	// intensity lives on the scene, not the texture — the Environment component
	// only wires scene.environment, so the multiplier is applied here
	$effect(() => {
		scene.environmentIntensity = $environmentIntensity;
		invalidate();
		return () => {
			scene.environmentIntensity = 1;
		};
	});
</script>

<!--
	IBL only: `isBackground` stays at its default (false), so the HDR feeds
	reflections and ambient light without ever drawing as a skybox — the
	visible backdrop belongs to a later car of the visual train (tableplace-152
	is IBL only).
-->
<!--
	The -1k file is rock-hill2.hdr downsampled to 1024x512 (magick -resize):
	PMREM renders at most a 256px cubemap, so the reflections are identical,
	but the 4k original cost 24 MB and a multi-second main-thread decode +
	prefilter on every page load — long enough on a slow machine to stall
	frames mid-drag (see #159 for the CI failure it caused).
-->
<Environment url={getStaticResourceUrl('/rock-hill2-1k.hdr')} />
