<script lang="ts">
	import { T } from '@threlte/core';
	import { get } from 'svelte/store';
	import type { IntersectionEvent } from '@threlte/extras';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { gameStore } from './store/game/gameStore.svelte';
	import { gameActions } from './store/game/actions';
	import { dragStore } from './store/dragStore.svelte';
	import { claimPointerDown } from '$lib/utils/single-hit-dispatch';
	import {
		SNAP_GRID_COLS_DEFAULT,
		SNAP_GRID_PITCH_DEFAULT,
		SNAP_GRID_ROWS_DEFAULT,
		SNAP_MARKER_COLOR,
		SNAP_MARKER_COLOR_ACTIVE,
		SNAP_MARKER_Y
	} from '$lib/utils/constants-snap';
	import DropFootprint from './drop/DropFootprint.svelte';

	/**
	 * One authored snap grid, drawn flat on the felt: the extent rectangle at
	 * the lattice's yaw, and a dot on every cell centre — each dot is exactly
	 * where a caught drop lands, the same promise the point marker's dot makes.
	 *
	 * Editor-only, mounted behind `snapEditing` like SnapPointMarker, and with
	 * the same direct manipulation: drag to move the whole grid, right-click to
	 * delete it. The pane has pitch/cols/rows/yawStep with exact numbers.
	 *
	 * The local axes match `gridCandidate` in utils/transforms/snap: the outer
	 * group flattens the plane (plane +y = world −z), the inner one turns it by
	 * −yaw — the same convention the yaw tick on a point marker uses.
	 */

	let { id }: { id: string } = $props();

	const point = $derived($gameStore?.snapPoints?.[id]);
	const x = $derived(point?.position?.[0] ?? 0);
	const z = $derived(point?.position?.[1] ?? 0);
	const yaw = $derived(point?.rotation ?? 0);
	const pitch = $derived(point?.pitch ?? SNAP_GRID_PITCH_DEFAULT);
	const cols = $derived(point?.cols ?? SNAP_GRID_COLS_DEFAULT);
	const rows = $derived(point?.rows ?? SNAP_GRID_ROWS_DEFAULT);

	/** cell-centre offsets in grid-local (u, v) — plane (x, y) once flattened */
	const cells = $derived.by(() => {
		const centres: [number, number][] = [];
		for (let i = 0; i < cols; i++) {
			for (let j = 0; j < rows; j++) {
				centres.push([(i - (cols - 1) / 2) * pitch, (j - (rows - 1) / 2) * pitch]);
			}
		}
		return centres;
	});

	let isHovered = $state(false);
	let isMoving = $state(false);
	const color = $derived(isMoving || isHovered ? SNAP_MARKER_COLOR_ACTIVE : SNAP_MARKER_COLOR);

	function onMove() {
		const hit = get(dragStore).intersectionPoint;
		if (!hit) return;
		gameActions.moveSnapPoint(id, [hit.x, hit.z]);
	}

	function stopMoving() {
		isMoving = false;
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', stopMoving);
		window.removeEventListener('pointercancel', stopMoving);
	}

	$effect(() => stopMoving);

	function handlePointerDown(e: IntersectionEvent<PointerEvent>) {
		// a card/piece drag in flight owns the pointer — never steal it
		if (get(dragStore).isDragging) return;
		if (!claimPointerDown(e)) return;
		isMoving = true;
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', stopMoving);
		window.addEventListener('pointercancel', stopMoving);
	}

	function handleContextMenu(e: IntersectionEvent<MouseEvent>) {
		e.stopPropagation();
		e.nativeEvent.preventDefault();
		gameActions.removeSnapPoint(id);
	}
</script>

{#if point?.position}
	<T.Group
		position={[x, SNAP_MARKER_Y, z]}
		onpointerdown={handlePointerDown}
		oncontextmenu={handleContextMenu}
		onpointerenter={() => (isHovered = true)}
		onpointerleave={() => (isHovered = false)}
	>
		<T.Group rotation.x={-Math.PI / 2}>
			<T.Group rotation.z={-yaw * DEG2RAD}>
				<DropFootprint
					shape="rect"
					w={cols * pitch}
					h={rows * pitch}
					{color}
					fill={0.08}
					border={0.045}
				/>
				{#each cells as [u, v], i (i)}
					<T.Mesh position={[u, v, 0.003]}>
						<T.CircleGeometry args={[0.07, 16]} />
						<T.MeshBasicMaterial {color} transparent opacity={0.9} depthWrite={false} side={2} />
					</T.Mesh>
				{/each}
			</T.Group>
		</T.Group>
	</T.Group>
{/if}
