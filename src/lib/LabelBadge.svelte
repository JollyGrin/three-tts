<script lang="ts">
	import * as THREE from 'three';
	import type { ComponentProps } from 'svelte';
	import { T } from '@threlte/core';
	import { Billboard, Text } from '@threlte/extras';

	/**
	 * The one floating label every entity wears: a billboarded pill — rounded
	 * dark plate behind light text — so a counter's "17/17", a bag's "∞" and a
	 * deck's card count all read as the same deliberate piece of game UI instead
	 * of three different debug overlays.
	 *
	 * The plate is cut to the text's LAID-OUT bounds (troika reports them after
	 * every sync), not estimated from character count — a bag hovering into
	 * "Damage counters · ∞" grows its plate to fit, and the pill's corner radius
	 * rides the text height so every badge keeps the same shape at any fontSize.
	 *
	 * Neither mesh raycasts. The old troika label DID (an accident tableplace-84
	 * had to guard the counter against), and the plate's padding made that fatal:
	 * a hovered model tile's floating name eclipsed a grab aimed at the token
	 * standing on it, and the tile got dragged instead. A label is a readout, not
	 * a hitbox — the pointer always means the body under it.
	 */
	let {
		text,
		fontSize = 0.45,
		position = [0, 0, 0],
		scale = 1
	}: {
		text: string;
		fontSize?: number;
		position?: [number, number, number];
		/** the value-change pulse drives this; it scales plate and text together */
		scale?: number;
	} = $props();

	// troika's textRenderInfo isn't in Threlte's Text types, only on the
	// underlying object — this is the one field the plate needs from it.
	// (TextMesh itself isn't exported from the package index, so the ref type
	// is derived from the component's own props.)
	type SyncedText = NonNullable<ComponentProps<typeof Text>['ref']> & {
		textRenderInfo?: { blockBounds: [number, number, number, number] };
	};

	let textRef = $state<SyncedText>();
	// the text block's local-space bounds, refreshed on every troika sync — the
	// plate re-cuts whenever the label re-lays-out (hover renames a bag, a
	// counter ticks from 9/17 to 10/17)
	let bounds = $state<[number, number, number, number] | null>(null);

	function handleSync() {
		const block = textRef?.textRenderInfo?.blockBounds;
		if (block) bounds = [block[0], block[1], block[2], block[3]];
	}

	function pillShape(width: number, height: number): THREE.Shape {
		const radius = Math.min(width, height) / 2;
		const x = -width / 2;
		const y = -height / 2;
		const shape = new THREE.Shape();
		shape.moveTo(x + radius, y);
		shape.lineTo(x + width - radius, y);
		shape.absarc(x + width - radius, y + radius, radius, -Math.PI / 2, 0, false);
		shape.lineTo(x + width, y + height - radius);
		shape.absarc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2, false);
		shape.lineTo(x + radius, y + height);
		shape.absarc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI, false);
		shape.lineTo(x, y + radius);
		shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5, false);
		return shape;
	}

	const plate = $derived.by(() => {
		if (!bounds) return null;
		const [minX, minY, maxX, maxY] = bounds;
		// padding rides the fontSize so every badge keeps the same proportions
		const padX = fontSize * 0.42;
		const padY = fontSize * 0.24;
		const width = maxX - minX + padX * 2;
		const height = maxY - minY + padY * 2;
		return {
			geometry: new THREE.ShapeGeometry(pillShape(width, height), 12),
			// centred on the text block, wherever the anchors put it
			center: [(minX + maxX) / 2, (minY + maxY) / 2] as [number, number]
		};
	});

	// each re-layout cuts a fresh geometry; the old one holds GPU buffers
	$effect(() => {
		const geometry = plate?.geometry;
		return () => geometry?.dispose();
	});

	// see the component comment: the badge must never answer the raycaster
	const noRaycast = () => null;
</script>

<Billboard {position}>
	<!-- userData.badge is the test bridge's handle on this group (visibility and
	     the pulse scale) — a NAME here would steal the raycast attribution from
	     the entity's own group, which `hits()` resolves by nearest named ancestor -->
	<T.Group {scale} userData={{ badge: true }}>
		{#if plate}
			<!-- explicit renderOrder: plate then text — both are transparent and sit
			     ~coplanar, so distance sorting between them is a coin flip -->
			<T.Mesh
				geometry={plate.geometry}
				position={[plate.center[0], plate.center[1], -0.015]}
				renderOrder={1}
				raycast={noRaycast}
			>
				<T.MeshBasicMaterial color="#16130f" transparent opacity={0.72} depthWrite={false} />
			</T.Mesh>
		{/if}
		<!-- troika's default TOP anchor, exactly like the labels this replaces: the
		     badge hangs below `position`, so entity bounding boxes (which the e2e
		     harness aims its pointer at) keep their old extents, and the pulse
		     scales around the same origin it always did -->
		<Text
			bind:ref={textRef}
			onsync={handleSync}
			{text}
			{fontSize}
			raycast={noRaycast}
			anchorX="center"
			color="#f6f2e9"
			outlineWidth={fontSize * 0.02}
			outlineColor="#16130f"
			renderOrder={2}
		/>
	</T.Group>
</Billboard>
