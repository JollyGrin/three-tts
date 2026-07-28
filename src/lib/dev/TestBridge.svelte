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
	import { useTask, useThrelte } from '@threlte/core';
	import { installTestBridge, removeTestBridge } from './test-bridge';

	const { camera, renderer, scene } = useThrelte();

	/**
	 * `ready` also waits for the scene's image-based lighting (HDR.svelte).
	 *
	 * The environment texture applies asynchronously (fetch + HDR decode +
	 * PMREM), and the first render after it lands recompiles every Standard
	 * material — under SwiftShader on a slow machine that is a seconds-long
	 * frame gap. A harness that starts interacting before the storm gets its
	 * press events queued across the gap: the pressed entity's spring jumps a
	 * whole descent in one frame, the press lands where the entity WAS, and
	 * the raycast grabs whatever sat underneath (see #159 — a tile relocated
	 * to the drop point of the token aimed at it). Counting two task ticks
	 * with the environment set means one full render with it has completed,
	 * so `ready` only flips once the storm is over. The task auto-invalidates,
	 * guaranteeing those frames happen, and stops itself after settling.
	 *
	 * Deliberate coupling: a scene that mounts this bridge is expected to also
	 * mount an environment (TableScene mounts both). If the environment fails
	 * to load, `ready` never flips and every spec fails loudly at openTable —
	 * a missing light rig is a broken scene for the visual train's purposes.
	 */
	let framesWithEnvironment = 0;
	const gate = useTask(() => {
		if (!scene.environment) return;
		framesWithEnvironment++;
		if (framesWithEnvironment >= 2) gate.stop();
	});

	$effect(() => {
		installTestBridge({
			camera: () => $camera,
			canvas: () => renderer?.domElement,
			scene: () => scene,
			isReady: () => framesWithEnvironment >= 2
		});
		return removeTestBridge;
	});
</script>
