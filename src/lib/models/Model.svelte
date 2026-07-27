<!--
	The body of a `kind: 'model'` piece: a catalog GLB, cloned from the
	module-level prototype cache and mounted under the piece's named group
	(Piece.svelte owns the group, the drag handlers and the yaw — this
	component only supplies geometry).

	Anything that can't resolve — no manifest, unknown ref, load failure, a
	model over the vertex budget — renders the placeholder box at the piece's
	footprint instead. Placeholder, never error: an unknown ref arriving over
	the wire must not take the table down.
-->
<script lang="ts">
	import { T } from '@threlte/core';
	import type * as THREE from 'three';
	import { modelCatalog, ensureModelCatalog } from './catalog-store';
	import { resolveModelRef } from './catalog';
	import { cloneModelScene } from './loader';
	import { registerModelSurface, unregisterModelSurface } from './surface';
	import { PIECE_REST_Y } from '$lib/utils/constants-pieces';
	import { TABLE_TOP_Y } from '$lib/utils/constants-table';

	let {
		id,
		modelRef,
		radius = 1.42
	}: {
		/** piece id — what the surface raycast registry keys on */
		id: string;
		/** the piece's `model:<kit>/<name>` ref */
		modelRef?: string;
		/** footprint circumradius, sizes the placeholder when nothing resolves */
		radius?: number;
	} = $props();

	// the manifest is fetched once per session; this just makes sure someone asked
	$effect(() => {
		void ensureModelCatalog();
	});

	const resolved = $derived(resolveModelRef($modelCatalog, modelRef));

	let scene: THREE.Group | null = $state(null);
	let failed = $state(false);

	$effect(() => {
		const target = resolved;
		scene = null;
		failed = false;
		if (!target) return;
		let cancelled = false;
		cloneModelScene(target.url).then(
			(cloned) => {
				if (!cancelled) scene = cloned;
			},
			(error) => {
				console.warn(`[models] ${target.url} failed to load:`, error);
				if (!cancelled) failed = true;
			}
		);
		return () => {
			cancelled = true;
		};
	});

	/**
	 * Every piece's origin rests half a disc-thickness above its floor
	 * (PIECE_REST_Y vs TABLE_TOP_Y — see resolveDrop's piece branch). A model's
	 * pivot is authored at its own floor, so the render compensates by that
	 * constant and the store/drop/sync path stays identical for every kind.
	 */
	const FLOOR_COMPENSATION = TABLE_TOP_Y - PIECE_REST_Y;

	/** world footprint for the placeholder box, from the manifest when it resolves */
	const placeholderFootprint = $derived(
		resolved ? resolved.footprint : ([radius * 1.4, radius * 1.4] as [number, number])
	);

	/**
	 * The mounted scene is what drops raycast against for surface rest. Keyed by
	 * the piece id so the drop logic can exclude the piece being dragged.
	 */
	function attachSurface(object: THREE.Object3D) {
		registerModelSurface(id, object);
		return () => unregisterModelSurface(id, object);
	}
</script>

<T.Group position.y={FLOOR_COMPENSATION}>
	{#if scene && resolved}
		{#key scene}
			<T.Group scale={resolved.scale} position.y={(resolved.entry.yOffset ?? 0) * resolved.scale}>
				<T is={scene} oncreate={(ref: THREE.Object3D) => attachSurface(ref)} />
			</T.Group>
		{/key}
	{:else}
		<!-- loading, unresolved or refused: a quiet box the size of the footprint,
		     so the piece stays visible, draggable and removable either way -->
		<T.Mesh castShadow position.y={0.5}>
			<T.BoxGeometry args={[placeholderFootprint[0], 1, placeholderFootprint[1]]} />
			<T.MeshStandardMaterial
				color={failed ? '#7a4a4a' : '#6b675c'}
				roughness={0.9}
				transparent
				opacity={0.75}
			/>
		</T.Mesh>
	{/if}
</T.Group>
