<script lang="ts">
	import { T } from '@threlte/core';
	import { get } from 'svelte/store';
	import type { IntersectionEvent } from '@threlte/extras';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { gameStore } from './store/game/gameStore.svelte';
	import { gameActions } from './store/game/actions';
	import { dragStore } from './store/dragStore.svelte';
	import { claimPointerDown } from '$lib/utils/single-hit-dispatch';
	import { snapRadius } from '$lib/utils/transforms/snap';
	import {
		SNAP_MARKER_COLOR,
		SNAP_MARKER_COLOR_ACTIVE,
		SNAP_MARKER_Y
	} from '$lib/utils/constants-snap';
	import DropFootprint from './drop/DropFootprint.svelte';

	/**
	 * One authored snap point, drawn flat on the felt: a ring at its catch
	 * radius, a dot on the point itself, and a tick pointing along the yaw when
	 * one is authored.
	 *
	 * Editor-only — `TableScene` mounts these behind `snapEditing`, so /play
	 * never draws them (see `store/tableFeatures`). Drag to move, right-click to
	 * delete; the pane has the same operations with exact numbers.
	 *
	 * The drag is deliberately local rather than routed through `dragStore`:
	 * that store is the card/piece pipeline, whose every consumer assumes the
	 * dragged id is an entity in `cards`/`pieces` that a drop resolves a landing
	 * for. A snap point has no landing — it *is* one. All it needs is the table
	 * raycast point, which `TableScene.compute` already publishes on every
	 * pointer move.
	 */

	let { id }: { id: string } = $props();

	const point = $derived($gameStore?.snapPoints?.[id]);
	const radius = $derived(snapRadius(point));
	const yaw = $derived(point?.rotation);
	const x = $derived(point?.position?.[0] ?? 0);
	const z = $derived(point?.position?.[1] ?? 0);

	let isHovered = $state(false);
	let isMoving = $state(false);
	const color = $derived(isMoving || isHovered ? SNAP_MARKER_COLOR_ACTIVE : SNAP_MARKER_COLOR);

	function onMove() {
		const hit = get(dragStore).intersectionPoint;
		if (!hit) return;
		// clamped inside the felt by moveSnapPoint, same as any other placement
		gameActions.moveSnapPoint(id, [hit.x, hit.z]);
	}

	function stopMoving() {
		isMoving = false;
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', stopMoving);
		window.removeEventListener('pointercancel', stopMoving);
	}

	// leaving the editor (or a scenario load removing this point) mid-drag must
	// not leave the window listeners behind
	$effect(() => stopMoving);

	function handlePointerDown(e: IntersectionEvent<PointerEvent>) {
		// a card/piece drag in flight owns the pointer — never steal it, or a
		// release over a marker would move the marker instead of landing the card
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
			<DropFootprint shape="circle" r={radius} {color} fill={0.14} border={0.045} />
			<!-- the point itself: the ring shows the catch radius, this shows where
			     a caught drop actually lands -->
			<T.Mesh position.z={0.003}>
				<T.CircleGeometry args={[0.07, 16]} />
				<T.MeshBasicMaterial {color} transparent opacity={0.95} depthWrite={false} side={2} />
			</T.Mesh>
			{#if yaw !== undefined}
				<!-- yaw tick. -yaw about the view axis matches how a card renders its
				     table rotation (Card.svelte: rotation.y = -rotation[2]), so the
				     tick points where a caught card's top edge will face. -->
				<T.Group rotation.z={-yaw * DEG2RAD}>
					<T.Mesh position={[0, radius / 2, 0.003]}>
						<T.PlaneGeometry args={[0.05, radius]} />
						<T.MeshBasicMaterial {color} transparent opacity={0.9} depthWrite={false} side={2} />
					</T.Mesh>
				</T.Group>
			{/if}
		</T.Group>
	</T.Group>
{/if}
