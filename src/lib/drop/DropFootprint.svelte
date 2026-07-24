<script lang="ts">
	import { T } from '@threlte/core';

	/**
	 * Outline + faint fill drawn in the local XY plane. The parent decides the
	 * orientation (the table indicator lays it flat, the tray uses it as-is),
	 * which keeps this usable in both the world scene and the HUD.
	 *
	 * The border is built from thin quads rather than a LINE: WebGL line width
	 * is stuck at one device pixel, which all but disappears at a low camera
	 * angle — the exact case this indicator exists for.
	 *
	 * Dimensions come in as numbers rather than a footprint object on purpose:
	 * threlte rebuilds a geometry whenever its `args` array changes identity,
	 * and this redraws on every pointer move during a drag.
	 */
	let {
		shape,
		w = 0,
		h = 0,
		r = 0,
		color = '#5ee7ff',
		fill = 0.12,
		border = 0.06,
		depthTest = true
	}: {
		shape: 'rect' | 'circle';
		w?: number;
		h?: number;
		r?: number;
		color?: string;
		fill?: number;
		border?: number;
		depthTest?: boolean;
	} = $props();

	// [width, height, x, y] of each border quad, inset so the outline sits
	// inside the footprint instead of straddling its edge
	const bars = $derived.by((): [number, number, number, number][] => {
		if (shape !== 'rect') return [];
		const inset = border / 2;
		return [
			[w, border, 0, h / 2 - inset],
			[w, border, 0, -h / 2 + inset],
			[border, h - border * 2, -w / 2 + inset, 0],
			[border, h - border * 2, w / 2 - inset, 0]
		];
	});

	const innerRadius = $derived(Math.max(0, r - border));
</script>

{#if shape === 'rect'}
	<T.Mesh>
		<T.PlaneGeometry args={[w, h]} />
		<T.MeshBasicMaterial
			{color}
			transparent
			opacity={fill}
			{depthTest}
			depthWrite={false}
			side={2}
		/>
	</T.Mesh>
	{#each bars as [bw, bh, bx, by], i (i)}
		<T.Mesh position={[bx, by, 0.002]}>
			<T.PlaneGeometry args={[bw, bh]} />
			<T.MeshBasicMaterial
				{color}
				transparent
				opacity={0.9}
				{depthTest}
				depthWrite={false}
				side={2}
			/>
		</T.Mesh>
	{/each}
{:else}
	<T.Mesh>
		<T.CircleGeometry args={[r, 40]} />
		<T.MeshBasicMaterial
			{color}
			transparent
			opacity={fill}
			{depthTest}
			depthWrite={false}
			side={2}
		/>
	</T.Mesh>
	<T.Mesh position.z={0.002}>
		<T.RingGeometry args={[innerRadius, r, 40]} />
		<T.MeshBasicMaterial
			{color}
			transparent
			opacity={0.9}
			{depthTest}
			depthWrite={false}
			side={2}
		/>
	</T.Mesh>
{/if}
