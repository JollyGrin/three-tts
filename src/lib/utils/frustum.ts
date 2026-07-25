/**
 * Geometry for the remote-player camera avatar: an open, rectangular view
 * pyramid with its apex at the origin, opening along -Z (three.js' camera
 * forward axis, so a `Matrix4.lookAt` basis orients it correctly).
 *
 * Built at unit length so a single shared geometry can be scaled per avatar —
 * a uniform scale preserves the fov, and rebuilding geometry every frame would
 * churn GPU buffers.
 *
 * The real frustum is never drawn: the scene's depth range is deliberately
 * tight (near 0.5 / far 200, TableCamera.svelte) and a 40-unit cone from a
 * bird's-eye orbit would swallow the whole board. The avatar shows a short
 * stub of it instead — see FRUSTUM_STUB_* in RemoteCameraAvatar.svelte.
 */

import * as THREE from 'three';

/** matches TableCamera's fixed fov — "zoom" here is orbit distance, not fov */
export const FRUSTUM_FOV_DEG = 35;
/** nominal viewport aspect; avatars are a cue, not a projection replica */
export const FRUSTUM_ASPECT = 16 / 9;

/** Half-width/half-height of the frustum's far rectangle at `length`. */
export function frustumHalfExtents(
	length = 1,
	fovDeg = FRUSTUM_FOV_DEG,
	aspect = FRUSTUM_ASPECT
): { halfWidth: number; halfHeight: number } {
	const halfHeight = Math.tan((fovDeg * Math.PI) / 360) * length;
	return { halfWidth: halfHeight * aspect, halfHeight };
}

/**
 * Four side triangles, no cap — the open mouth reads as a view cone rather
 * than a solid wedge. DoubleSide material, so winding does not matter.
 */
export function createFrustumGeometry(
	fovDeg = FRUSTUM_FOV_DEG,
	aspect = FRUSTUM_ASPECT
): THREE.BufferGeometry {
	const { halfWidth: w, halfHeight: h } = frustumHalfExtents(1, fovDeg, aspect);
	const apex: [number, number, number] = [0, 0, 0];
	const corners: [number, number, number][] = [
		[-w, -h, -1],
		[w, -h, -1],
		[w, h, -1],
		[-w, h, -1]
	];

	const vertices: number[] = [];
	for (let i = 0; i < corners.length; i++) {
		vertices.push(...apex, ...corners[i], ...corners[(i + 1) % corners.length]);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	geometry.computeVertexNormals();
	return geometry;
}

/** The four apex→corner rays plus the mouth rectangle, as line segments. */
export function createFrustumEdgesGeometry(
	fovDeg = FRUSTUM_FOV_DEG,
	aspect = FRUSTUM_ASPECT
): THREE.BufferGeometry {
	const { halfWidth: w, halfHeight: h } = frustumHalfExtents(1, fovDeg, aspect);
	const corners: [number, number, number][] = [
		[-w, -h, -1],
		[w, -h, -1],
		[w, h, -1],
		[-w, h, -1]
	];

	const vertices: number[] = [];
	for (let i = 0; i < corners.length; i++) {
		vertices.push(0, 0, 0, ...corners[i]); // apex → corner
		vertices.push(...corners[i], ...corners[(i + 1) % corners.length]); // mouth edge
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	return geometry;
}
