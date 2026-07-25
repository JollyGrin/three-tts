<script lang="ts">
	/**
	 * One remote player's camera, drawn in the shared scene: a small body box at
	 * their eye position with a translucent view pyramid opening toward whatever
	 * they are orbiting around. Watching it glide and tip is how you see an
	 * opponent lean over the board.
	 *
	 * Purely decorative: no pointer handlers (so it can never eat a drag) and
	 * `depthWrite={false}` everywhere (so it can never occlude a drop indicator
	 * or a card face — it only ever tints what is behind it).
	 */
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { Spring } from 'svelte/motion';
	import {
		remoteCameraStore,
		remoteCameraNow,
		cameraOpacity
	} from '$lib/store/remoteCameraStore.svelte';
	import { createFrustumGeometry, createFrustumEdgesGeometry } from '$lib/utils/frustum';

	let { playerId, color }: { playerId: string; color: string } = $props();

	const camera = $derived($remoteCameraStore[playerId]);

	// Built once per avatar (there are at most three) and never rebuilt: the
	// frustum is authored at unit length and the stub is applied as a uniform
	// scale, so changing zoom never touches a GPU buffer. Per-instance rather
	// than module-level so Threlte's unmount disposal can't free a geometry
	// another avatar is still drawing.
	const frustumGeometry = createFrustumGeometry();
	const frustumEdges = createFrustumEdgesGeometry();

	/** body box, in world units — small enough to read as a prop, not an object */
	const BODY = [0.5, 0.36, 0.62] as const;

	// The stub tracks orbit distance so "leaning in" reads: a player zoomed onto
	// one card gets a short, tight cone; someone sitting back gets a longer one
	// that still visibly reaches for the felt. Never the real far plane (40) —
	// that would fill the board.
	const STUB_MIN = 0.9;
	const STUB_MAX = 3;
	const STUB_PER_UNIT_DISTANCE = 0.12;

	// Remote samples arrive at ≤ 3 Hz, so both ends of the pose spring toward
	// the latest sample instead of teleporting between packets — the same
	// pattern (and constants) as the remote-drag glide in Card/Piece.svelte.
	// Seeded from the first sample by the effect below rather than from
	// `camera` here: reading reactive state in a constructor would capture only
	// its initial value.
	const pose = new Spring(
		{ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 },
		{ stiffness: 0.15, damping: 0.8, precision: 0.0001 }
	);

	// gates the first render too: without it the avatar would flash at the
	// origin for one frame before the seeding effect runs
	let seeded = $state(false);
	$effect(() => {
		if (!camera) return;
		const next = {
			px: camera.p[0],
			py: camera.p[1],
			pz: camera.p[2],
			tx: camera.t[0],
			ty: camera.t[1],
			tz: camera.t[2]
		};
		// first sample places the avatar; everything after glides to it
		if (!seeded) {
			seeded = true;
			pose.set(next, { instant: true });
		} else {
			pose.target = next;
		}
	});

	// scratch objects — reused so the per-frame derive allocates nothing
	const eye = new THREE.Vector3();
	const focus = new THREE.Vector3();
	const up = new THREE.Vector3(0, 1, 0);
	const basis = new THREE.Matrix4();
	const euler = new THREE.Euler();

	const position = $derived<[number, number, number]>([
		pose.current.px,
		pose.current.py,
		pose.current.pz
	]);

	/** how far they are zoomed out — OrbitControls clamps it to 1…40 */
	const orbitDistance = $derived(
		Math.hypot(
			pose.current.px - pose.current.tx,
			pose.current.py - pose.current.ty,
			pose.current.pz - pose.current.tz
		)
	);

	/**
	 * `Matrix4.lookAt` builds the camera-style basis (-Z toward the target),
	 * which is exactly how the frustum geometry is authored — so no quaternion
	 * slerp is needed, the springed endpoints already carry the orientation.
	 */
	const rotation = $derived.by<[number, number, number]>(() => {
		if (orbitDistance < 1e-4) return [0, 0, 0];
		eye.set(pose.current.px, pose.current.py, pose.current.pz);
		focus.set(pose.current.tx, pose.current.ty, pose.current.tz);
		basis.lookAt(eye, focus, up);
		euler.setFromRotationMatrix(basis);
		return [euler.x, euler.y, euler.z];
	});

	const stub = $derived(
		Math.min(STUB_MAX, Math.max(STUB_MIN, orbitDistance * STUB_PER_UNIT_DISTANCE))
	);

	// fade a peer out once their samples stop; the store drops them entirely
	// after CAMERA_EXPIRE_MS (see remoteCameraStore for why expiry is our only
	// disconnect signal)
	const fade = $derived(cameraOpacity(Math.max(0, $remoteCameraNow - (camera?.lastSeen ?? 0))));
</script>

{#if camera && seeded}
	<T.Group {position} {rotation}>
		<!-- camera body -->
		<T.Mesh position={[0, 0, BODY[2] / 2]}>
			<T.BoxGeometry args={[BODY[0], BODY[1], BODY[2]]} />
			<T.MeshBasicMaterial {color} transparent opacity={0.55 * fade} depthWrite={false} />
		</T.Mesh>

		<!-- view frustum: translucent body … -->
		<T.Mesh scale={stub}>
			<T is={frustumGeometry} />
			<T.MeshBasicMaterial
				{color}
				transparent
				opacity={0.14 * fade}
				depthWrite={false}
				side={THREE.DoubleSide}
			/>
		</T.Mesh>

		<!-- … plus its edges, which is what actually reads at a distance -->
		<T.LineSegments scale={stub}>
			<T is={frustumEdges} />
			<T.LineBasicMaterial {color} transparent opacity={0.6 * fade} depthWrite={false} />
		</T.LineSegments>
	</T.Group>
{/if}
