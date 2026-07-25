<!--
	Mounts the headless harness's handle on `window` (see test-bridge.ts). Only
	rendered under `import.meta.env.DEV`, so it is compiled out of the static
	build entirely — the check is a literal `false` there.

	It reads the scene through `useThrelte()`, which is why this has to be a
	component inside the Canvas rather than a plain module: the camera and the
	renderer's canvas element are what turn a world position into a pixel the
	harness can click.
-->
<script lang="ts">
	import { useThrelte } from '@threlte/core';
	import { installTestBridge, removeTestBridge } from './test-bridge';

	const { camera, renderer, scene } = useThrelte();

	$effect(() => {
		installTestBridge({
			camera: () => $camera,
			canvas: () => renderer?.domElement,
			scene: () => scene
		});
		return removeTestBridge;
	});
</script>
