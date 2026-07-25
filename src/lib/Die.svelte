<!--
	The visible half of a die piece: procedural geometry from
	`$lib/primitives/die`, plus the tumble.

	Nothing here decides anything. The result is picked once by the roller
	(`gameActions.rollDie`) and broadcast as `{value, rollSeq}` in a single
	patch; this component only *replays* it. Every client runs the same replay
	off the same two numbers, so the show is shared without a single animation
	frame crossing the wire — the sync design borrowed from unbrewed-p2p's
	predetermined-outcome dice.

	Springs only, no physics (SPEC.md §3): a lift, a multi-axis spin that winds
	down onto the settled orientation, and a landing pulse.
-->
<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { Spring } from 'svelte/motion';
	import { dieMaterial, dieModel, dieRestOffset, dieSettleQuaternion } from '$lib/primitives/die';
	import { rollAction, tumbleOrientation, tumbleSpin, type DieSpin } from '$lib/utils/die-tumble';
	import { DIE_LIFT_Y, PIECE_THICKNESS } from '$lib/utils/constants-pieces';
	import type { DieSides } from '$lib/store/game/types';

	let {
		sides,
		value,
		rollSeq,
		radius,
		color
	}: {
		sides: DieSides;
		value: number;
		/** bumped once per roll — the only animation trigger */
		rollSeq: number;
		radius: number;
		color: string;
	} = $props();

	/** ms from the roll to the die starting to fall */
	const DROP_AT_MS = 440;
	/** ms from the roll to it hitting the table */
	const LAND_AT_MS = 760;

	const model = $derived(dieModel(sides));
	const material = $derived(dieMaterial(sides, color));

	/**
	 * The spin winds down as `progress` runs 0 → 1, and the extra rotation is a
	 * whole number of turns about each axis, so it is exactly the identity when
	 * it gets there: the die lands on `to` to the degree, however the spring
	 * approaches. Damped past 1 on purpose — an overshoot here would be an
	 * overshoot of several turns, not of a few degrees.
	 */
	const progress = new Spring(1, { stiffness: 0.05, damping: 0.9, precision: 0.0005 });
	/** the arc. Under-damped, and read through Math.abs, so the dip below the table reads as a bounce */
	const lift = new Spring(0, { stiffness: 0.12, damping: 0.5, precision: 0.0005 });
	/** landing pop — the counter's value-changed pulse, applied to the whole die */
	const pulse = new Spring(1, { stiffness: 0.15, damping: 0.5, precision: 0.001 });

	let from = $state(new THREE.Quaternion());
	let to = $state(new THREE.Quaternion());
	let spin: DieSpin = $state(tumbleSpin(0, 0));

	let dropTimer: ReturnType<typeof setTimeout> | undefined;
	let landTimer: ReturnType<typeof setTimeout> | undefined;

	function tumble(fromValue: number, toValue: number, seq: number) {
		from = dieSettleQuaternion(sides, fromValue);
		to = dieSettleQuaternion(sides, toValue);
		spin = tumbleSpin(seq, toValue);

		progress.set(0, { instant: true });
		progress.target = 1;
		lift.set(0, { instant: true });
		lift.target = DIE_LIFT_Y;

		clearTimeout(dropTimer);
		clearTimeout(landTimer);
		dropTimer = setTimeout(() => (lift.target = 0), DROP_AT_MS);
		landTimer = setTimeout(() => {
			pulse.set(1.14, { instant: true });
			pulse.target = 1;
		}, LAND_AT_MS);
	}

	/** last roll this client has *seen*; undefined until the first sync */
	let seenSeq: number | undefined = undefined;
	let shownValue = 1;

	$effect(() => {
		const shape = sides;
		const seq = rollSeq;
		const result = value;

		const settle = () => {
			from = dieSettleQuaternion(shape, result);
			to = from.clone();
			progress.set(1, { instant: true });
		};

		const action = rollAction(seenSeq, seq);
		seenSeq = seq;
		if (action === 'tumble') tumble(shownValue, result, seq);
		else settle();
		shownValue = result;
	});

	$effect(() => () => {
		clearTimeout(dropTimer);
		clearTimeout(landTimer);
	});

	// Euler rather than a quaternion prop: identical once applied, and it goes
	// through the same `rotation` plumbing every other piece uses
	const rotation = $derived(
		new THREE.Euler().setFromQuaternion(tumbleOrientation(from, to, spin, progress.current))
	);

	// The piece group sits at disc-rest height, so shift up to where a solid of
	// this shape actually balances. Growing from the contact point keeps the
	// landing pulse from punching the die through the table.
	const offsetY = $derived(
		dieRestOffset(sides, radius) * pulse.current - PIECE_THICKNESS / 2 + Math.abs(lift.current)
	);
</script>

<T.Group position.y={offsetY} rotation={[rotation.x, rotation.y, rotation.z]}>
	<!-- Key the MESH, not the material or geometry: threlte 8.5 detaches a
	     swapped material from a live mesh without reattaching it, leaving the
	     die invisible (see the same note on Card.svelte). `material` is cached
	     per shape+colour, so its identity changes exactly when either does. -->
	{#key material}
		<T.Mesh castShadow scale={radius * pulse.current}>
			<!-- shared across every die of this shape/colour, so never disposed with one instance -->
			<T is={model.geometry} attach="geometry" dispose={false} />
			<T is={material} attach="material" dispose={false} />
		</T.Mesh>
	{/key}
</T.Group>
