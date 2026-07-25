<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js';
	import * as THREE from 'three';
	import { dragStore } from '$lib/store/dragStore.svelte';
	import { cameraBroadcastSignal, cameraResetSignal } from '$lib/store/cameraStore.svelte';
	import { gameActions } from './store/game/actions';
	import { gameStore } from './store/game/gameStore.svelte';
	import { createCameraStream } from '$lib/websocket/cameraStream';
	import { isWebSocketConnected, sendMessage } from '$lib/websocket/connection';

	const isDragging = $derived($dragStore.isDragging !== null);

	const y = 25;
	const seating = [
		[0, y, 0],
		[0, y, -0.01],
		[0.1, y, 0],
		[-0.1, y, 0]
	];

	const myId = gameActions?.getMyId() ?? '';
	const seat = $derived($gameStore?.players?.[myId]?.seat ?? 0);

	let camera: THREE.PerspectiveCamera | undefined = $state();
	let controls: OrbitControlsType | undefined = $state();

	// reset to the seat's default birds-eye view when requested (keybind C)
	$effect(() => {
		if ($cameraResetSignal === 0) return;
		const [px, py, pz] = seating[seat];
		if (!camera || !controls) return;
		camera.position.set(px, py, pz);
		controls.target.set(0, 0, 0);
		controls.update();
	});

	/**
	 * Presence: stream our pose to peers so they can draw our camera avatar.
	 *
	 * This bypasses gameStore entirely — see websocket/cameraStream.ts for why
	 * (unthrottled path + poses would be persisted into lobby state). The
	 * stream is self-throttling and silent while the camera is still, so an
	 * idle client puts nothing on the wire.
	 */
	const cameraStream = createCameraStream((sample) => {
		if (!isWebSocketConnected()) return false;
		const playerId = gameActions.getMyId();
		if (!playerId) return false;
		return sendMessage({ type: 'camera', playerId, timestamp: Date.now(), value: sample });
	});

	$effect(() => () => cameraStream.dispose());

	/**
	 * A local drag already spends 5 Hz of the server's 7 msg/s budget, and the
	 * limiter *disconnects* rather than drops. Measured against the Go server:
	 * a sustained 5 Hz drag plus 2.9 Hz of camera is 7.9/s and closes the
	 * socket with StatusPolicyViolation after ~20s. So the camera yields
	 * entirely while dragging — which costs nothing real, since OrbitControls
	 * rotation is already disabled then (only the wheel can still move it) —
	 * and the settled pose goes out on release.
	 */
	let forceOnRelease = false;

	function broadcastPose(force = false) {
		if (!camera || !controls) return;
		if (isDragging) {
			forceOnRelease ||= force;
			return;
		}
		const { x, y, z } = camera.position;
		const { x: tx, y: ty, z: tz } = controls.target;
		cameraStream.offer([x, y, z], [tx, ty, tz], force);
	}

	// a peer just joined and missed everything we sent before they connected
	$effect(() => {
		if ($cameraBroadcastSignal === 0) return;
		broadcastPose(true);
	});

	// drag released: resume the stream, and honour any join request we swallowed
	$effect(() => {
		if (isDragging) return;
		const force = forceOnRelease;
		forceOnRelease = false;
		broadcastPose(force);
	});
</script>

<!-- near/far bound tightly to the orbit range (min 1 / max 40): depth precision
     is proportional to near/far ratio, and card faces are only 0.02 apart -->
<T.PerspectiveCamera
	makeDefault
	bind:ref={camera}
	position={seating[seat] as [number, number, number]}
	fov={35}
	near={0.5}
	far={200}
>
	<OrbitControls
		bind:ref={controls}
		onchange={() => broadcastPose()}
		enableRotate={!isDragging}
		enableDamping
		maxPolarAngle={Math.PI / 2 - 0.1}
		target={[0, 0, 0]}
		minDistance={1}
		maxDistance={40}
	/>
</T.PerspectiveCamera>
