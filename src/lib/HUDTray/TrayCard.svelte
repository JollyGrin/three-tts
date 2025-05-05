<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { ImageMaterial, interactivity } from '@threlte/extras';
	import { Spring } from 'svelte/motion';
	import { degrees } from '$lib/utils/constants-rotation';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { getStaticResourceUrl } from '$lib/utils/image';
	import { dragStart, dragStore } from '$lib/store/dragStore.svelte';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { gameActions } from '$lib/store/game/actions';
	import CardHtmlUnmatched from '$lib/patch/unmatched/card/CardHTMLUnmatched.svelte';

	interactivity();
	let {
		id,
		index = 0,
		trayWidth = 0,
		isUnmatched = false
	}: { id: string; index: number; trayWidth?: number; isUnmatched?: boolean } = $props();

	const myPlayerId = $derived(gameActions?.getMe()?.id ?? '');
	const card = $derived($gameStore?.players?.[myPlayerId]?.tray?.[id] ?? {});

	let isCardHovered = $state(false);
	let emissiveIntensity = $state(0);

	$effect(() => {
		emissiveIntensity = isCardHovered ? 0.05 : 0;
	});

	const cardSize = [1.4 * 1.4, 2 * 1.4];
	let cardZ = $state(0); // z-index
	const cardY = new Spring(0, {
		stiffness: 0.15,
		damping: 0.7,
		precision: 0.0001
	});
	const cardScale = new Spring(0.55, {
		stiffness: 0.15,
		damping: 0.7,
		precision: 0.0001
	});

	function handlePointerEnter() {
		isCardHovered = true;
		cardScale.target = 1.5;
		cardY.target = 1.5;
		cardZ = 1;
	}
	function handlePointerLeave() {
		isCardHovered = false;
		cardScale.target = 0.55;
		cardY.target = 0;
		cardZ = 0;
	}
	function handleDragStart() {
		const { x = 0, z = 0 } = $dragStore.intersectionPoint as THREE.Vector3;

		const movedCard = gameActions.moveCardOutOfTray(id, myPlayerId);
		gameStore?.updateState({
			cards: {
				[id]: {
					...movedCard,
					position: [x, 2.5, z],
					rotation: [0, 0, -degrees[gameActions?.getMySeat()] / DEG2RAD],
					faceImageUrl: movedCard?.faceImageUrl ?? card?.faceImageUrl,
					backImageUrl:
						movedCard?.backImageUrl ?? card.backImageUrl ?? getStaticResourceUrl('/s-back.jpg') // TODO: update this with its actual cardback
				}
			}
		});
		dragStart(id, 2.5);
	}
</script>

<T.Mesh
	scale={cardScale.current}
	position.z={cardZ}
	position.y={cardY.current}
	position.x={-trayWidth / 2 + 1.25 + index * 1.2}
	onpointerenter={handlePointerEnter}
	onpointerleave={handlePointerLeave}
	onpointerdown={handleDragStart}
>
	<T.PlaneGeometry args={cardSize} />
	{#if isUnmatched}
		<CardHtmlUnmatched {id} />
	{:else}
		<ImageMaterial
			url={card.faceImageUrl ?? ''}
			side={2}
			radius={0.1}
			transparent={true}
			opacity={0.9}
		/>
	{/if}
</T.Mesh>
