<script lang="ts">
	import { T } from '@threlte/core';
	import { Billboard, Text, ImageMaterial } from '@threlte/extras';
	import { Spring } from 'svelte/motion';
	import { dragStart, dragStore } from './store/dragStore.svelte';
	import { gameStore } from './store/game/gameStore.svelte';
	import { gameActions } from './store/game/actions';
	import { resolveCardImage } from '$lib/packs';

	let { id }: { id: string } = $props();

	const piece = $derived($gameStore?.pieces?.[id]);
	const kind = $derived(piece?.kind ?? 'token');
	const radius = $derived(piece?.radius ?? 0.75);
	const color = $derived(piece?.color ?? '#c8c4b8');
	const imageUrl = $derived(resolveCardImage(piece?.imageUrl));
	const isDragging = $derived($dragStore.isDragging === id);
	let isHovered = $state(false);

	const THICKNESS = 0.16;
	const REST_Y = 0.255 + THICKNESS / 2;

	const height = new Spring(piece?.position?.[1] ?? REST_Y, {
		stiffness: 0.28,
		damping: 0.7,
		precision: 0.0001
	});

	$effect(() => {
		if (isDragging) return;
		height.target = piece?.position?.[1] ?? REST_Y;
	});

	const position: [number, number, number] = $derived([
		piece?.position?.[0] ?? 0,
		height.current,
		piece?.position?.[2] ?? 0
	]);

	function handlePointerDown(e: { nativeEvent?: PointerEvent } & PointerEvent) {
		// counters: click adjusts value (shift = decrement); drag still works via move
		if (kind === 'counter' && (e.shiftKey || e.altKey)) {
			gameActions.incrementCounter(id, -1);
			return;
		}
		dragStart(id, position[1]);
		height.target = 1.2;
	}

	function handleClick(e: PointerEvent) {
		if (kind !== 'counter') return;
		if (e.shiftKey || e.altKey) return; // handled on pointerdown
		gameActions.incrementCounter(id, 1);
	}

	const label = $derived(
		kind === 'counter' ? `${piece?.value ?? piece?.maxValue ?? 0}` : (piece?.name ?? '')
	);
</script>

{#if piece}
	<T.Group
		{position}
		onpointerdown={handlePointerDown}
		onclick={handleClick}
		onpointerenter={() => (isHovered = true)}
		onpointerleave={() => (isHovered = false)}
	>
		{#if kind === 'pawn'}
			<!-- procedural pawn: base disc + stem + head -->
			<T.Mesh castShadow position.y={0.06}>
				<T.CylinderGeometry args={[radius * 0.5, radius * 0.6, 0.12, 24]} />
				<T.MeshStandardMaterial {color} />
			</T.Mesh>
			<T.Mesh castShadow position.y={0.45}>
				<T.CylinderGeometry args={[radius * 0.16, radius * 0.3, 0.75, 16]} />
				<T.MeshStandardMaterial {color} />
			</T.Mesh>
			<T.Mesh castShadow position.y={0.95}>
				<T.SphereGeometry args={[radius * 0.32, 20, 16]} />
				<T.MeshStandardMaterial {color} />
			</T.Mesh>
		{:else}
			<!-- token / counter: flat disc, image or color on top -->
			<T.Mesh castShadow>
				<T.CylinderGeometry args={[radius, radius, THICKNESS, 36]} />
				<T.MeshStandardMaterial {color} />
			</T.Mesh>
			{#if imageUrl}
				<T.Mesh rotation.x={-Math.PI / 2} position.y={THICKNESS / 2 + 0.002}>
					<T.CircleGeometry args={[radius * 0.96, 36]} />
					{#key imageUrl}
						<ImageMaterial url={imageUrl} side={0} />
					{/key}
				</T.Mesh>
			{/if}
		{/if}

		{#if label && (kind === 'counter' || isHovered)}
			<Billboard>
				<Text
					text={label}
					fontSize={kind === 'counter' ? 0.55 : 0.35}
					position={[0, kind === 'pawn' ? 1.5 : 0.75, 0]}
					anchorX="center"
					color="#ffffff"
					outlineWidth={0.02}
					outlineColor="#000000"
				/>
			</Billboard>
		{/if}
	</T.Group>
{/if}
