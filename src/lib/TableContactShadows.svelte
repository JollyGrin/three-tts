<!--
	Contact shadows for the table (tableplace-153) — a blurred top-down depth
	pass composited onto a transparent plane just above the felt. This is what
	grounds pieces standing on a map overlay: the overlay's ImageMaterial is
	unlit, so the real shadow map can never darken it, but this plane sits
	above the overlay and under the pieces.

	A fork of @threlte/extras' <ContactShadows>, because that component only
	works when its group sits at y ≈ 0: its blur passes render a plane that is
	never added to the scene graph, so the plane rasterises at the WORLD
	origin while the shadow camera inherits the group's transform. Lift the
	group to the felt top (y = 0.255) and the blur quad lands behind the
	camera, is clipped, and the "blur" writes an empty texture over the depth
	pass — no shadow at all, silently. The fix here parents the blur quad
	into the camera's group, counter-rotated to net identity and held at
	mid-frustum, so it survives any group height. Also trimmed to what the
	table needs: always-continuous rendering, two fixed blur passes.
-->
<script lang="ts">
	import { T, useTask, useThrelte, type Props } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import {
		Color,
		Group,
		Mesh,
		MeshBasicMaterial,
		MeshDepthMaterial,
		OrthographicCamera,
		PlaneGeometry,
		ShaderMaterial,
		WebGLRenderTarget
	} from 'three';
	import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
	import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

	let {
		opacity = 1,
		blur = 1,
		far = 10,
		resolution = 512,
		width = 1,
		height = 1,
		color = '#000000',
		...props
	}: Props<Group> & {
		opacity?: number;
		blur?: number;
		/** how far above the plane an object still casts (world units) */
		far?: number;
		resolution?: number;
		width?: number;
		height?: number;
		color?: string;
	} = $props();

	const { scene, renderer } = useThrelte();

	const group = new Group();

	const renderTarget = new WebGLRenderTarget(resolution, resolution);
	renderTarget.texture.generateMipmaps = false;
	renderTarget.texture.colorSpace = renderer.outputColorSpace;

	const renderTargetBlur = new WebGLRenderTarget(resolution, resolution);
	renderTargetBlur.texture.generateMipmaps = false;

	// lies in the local XZ plane facing local -Y; the inner group's +90°
	// X-rotation and the meshes' own -90° compensations sort out world space
	const planeGeometry = new PlaneGeometry(width, height).rotateX(Math.PI / 2);
	const blurPlane = new Mesh(planeGeometry);
	blurPlane.visible = false;

	// depth → transparent black: alpha strongest right at the plane, fading
	// to nothing at `far`, which is exactly "contact" rather than projection
	const depthMaterial = new MeshDepthMaterial({ depthTest: false, depthWrite: false });
	depthMaterial.onBeforeCompile = (shader) => {
		shader.uniforms = {
			...shader.uniforms,
			uColor: { value: new Color(color).convertSRGBToLinear() }
		};
		shader.fragmentShader = `uniform vec3 uColor;\n${shader.fragmentShader}`;
		shader.fragmentShader = shader.fragmentShader.replace(
			'vec4( vec3( 1.0 - fragCoordZ ), opacity );',
			'vec4( uColor, ( 1.0 - fragCoordZ ) * 1.0 );'
		);
	};

	const horizontalBlurMaterial = new ShaderMaterial({ ...HorizontalBlurShader, depthTest: false });
	const verticalBlurMaterial = new ShaderMaterial({ ...VerticalBlurShader, depthTest: false });

	const shadowCamera = new OrthographicCamera(
		-width / 2,
		width / 2,
		height / 2,
		-height / 2,
		0,
		far
	);

	const shadowMaterial = new MeshBasicMaterial({
		map: renderTarget.texture,
		transparent: true,
		opacity,
		depthWrite: false
	});
	$effect.pre(() => {
		shadowMaterial.opacity = opacity;
	});

	let displayMesh: Mesh | undefined = $state();

	const blurShadows = (amount: number) => {
		blurPlane.visible = true;

		blurPlane.material = horizontalBlurMaterial;
		horizontalBlurMaterial.uniforms.tDiffuse.value = renderTarget.texture;
		horizontalBlurMaterial.uniforms.h.value = amount / 256;
		renderer.setRenderTarget(renderTargetBlur);
		renderer.render(blurPlane, shadowCamera);

		blurPlane.material = verticalBlurMaterial;
		verticalBlurMaterial.uniforms.tDiffuse.value = renderTargetBlur.texture;
		verticalBlurMaterial.uniforms.v.value = amount / 256;
		renderer.setRenderTarget(renderTarget);
		renderer.render(blurPlane, shadowCamera);

		blurPlane.visible = false;
	};

	const renderShadows = () => {
		// the shadow plane must not depth-render into its own pass
		if (displayMesh) displayMesh.visible = false;

		const initialBackground = scene.background;
		scene.background = null;
		const initialOverrideMaterial = scene.overrideMaterial;
		scene.overrideMaterial = depthMaterial;
		const initialClearAlpha = renderer.getClearAlpha();
		renderer.setClearAlpha(0);

		renderer.setRenderTarget(renderTarget);
		renderer.render(scene, shadowCamera);

		scene.overrideMaterial = initialOverrideMaterial;

		blurShadows(blur);
		// second, tighter pass: fills the gaps between the 9-tap kernel's taps —
		// on a hard wide silhouette edge (a bag pouch) the taps otherwise print
		// as discrete spikes, a fur-like fringe at the shadow's rim
		blurShadows(blur * 0.6);

		renderer.setRenderTarget(null);
		scene.background = initialBackground;
		renderer.setClearAlpha(initialClearAlpha);
		if (displayMesh) displayMesh.visible = true;
	};

	/**
	 * Every OTHER frame, not every frame. The pass costs a scene depth render
	 * plus four blur renders; under software rasterization (the e2e harness's
	 * SwiftShader, a throttled CI runner) that steady-state cost lengthens
	 * every frame, and long frames are what let a drag's queued pointer events
	 * skip across a gap — the #159 press-race. A soft blurred shadow lagging
	 * its caster by one frame is imperceptible at any real frame rate: the
	 * casters it tracks are spring-settled pieces, and dragged entities are
	 * excluded from the pass entirely (`far` clamp), so nothing it draws moves
	 * fast. Frame 1 still renders — the first painted frame has its shadows.
	 */
	let frame = 0;
	useTask(() => {
		if (frame++ % 2 === 0) renderShadows();
	});

	onDestroy(() => {
		renderTarget.dispose();
		renderTargetBlur.dispose();
		planeGeometry.dispose();
		depthMaterial.dispose();
		horizontalBlurMaterial.dispose();
		verticalBlurMaterial.dispose();
		shadowMaterial.dispose();
	});
</script>

<T is={group} {...props}>
	<T.Group rotation.x={Math.PI / 2}>
		<T.Mesh
			bind:ref={displayMesh}
			scale.y={-1}
			rotation.x={-Math.PI / 2}
			material={shadowMaterial}
			geometry={planeGeometry}
		/>
		<T is={shadowCamera} manual />
		<!-- the upstream bug fixed: the blur quad rides INSIDE the camera's
		     group (net world orientation identity, held at mid-frustum along
		     the camera's look) instead of dangling unparented at the world
		     origin, where any group height > 0 clips it out of the blur pass -->
		<T is={blurPlane} rotation.x={-Math.PI / 2} position.z={-far / 2} />
	</T.Group>
</T>
