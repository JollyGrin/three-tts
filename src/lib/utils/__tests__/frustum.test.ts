import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	FRUSTUM_ASPECT,
	FRUSTUM_FOV_DEG,
	createFrustumEdgesGeometry,
	createFrustumGeometry,
	frustumHalfExtents
} from '../frustum';

/** Mirrors RemoteCameraAvatar: Matrix4.lookAt basis + a uniform stub scale. */
function placeAvatar(
	eye: [number, number, number],
	target: [number, number, number],
	stub: number
) {
	const group = new THREE.Object3D();
	const basis = new THREE.Matrix4().lookAt(
		new THREE.Vector3(...eye),
		new THREE.Vector3(...target),
		new THREE.Vector3(0, 1, 0)
	);
	group.position.set(...eye);
	group.rotation.setFromRotationMatrix(basis);
	group.scale.setScalar(stub);
	group.updateMatrixWorld(true);
	return group;
}

describe('frustumHalfExtents', () => {
	it('matches the camera fov and widens with aspect', () => {
		const { halfWidth, halfHeight } = frustumHalfExtents(1);
		expect(halfHeight).toBeCloseTo(Math.tan((FRUSTUM_FOV_DEG * Math.PI) / 360));
		expect(halfWidth / halfHeight).toBeCloseTo(FRUSTUM_ASPECT);
	});

	it('scales linearly with length', () => {
		expect(frustumHalfExtents(4).halfHeight).toBeCloseTo(frustumHalfExtents(1).halfHeight * 4);
	});
});

describe('createFrustumGeometry', () => {
	it('is a unit-length open pyramid: apex at the origin, mouth at z = -1', () => {
		const positions = createFrustumGeometry().getAttribute('position');
		expect(positions.count).toBe(12); // 4 side triangles, no cap

		const z = Array.from({ length: positions.count }, (_, i) => positions.getZ(i));
		expect(Math.max(...z)).toBe(0); // apex
		expect(Math.min(...z)).toBe(-1); // mouth
	});

	it('draws the four apex rays and the mouth rectangle as edges', () => {
		expect(createFrustumEdgesGeometry().getAttribute('position').count).toBe(16); // 8 segments
	});
});

describe('avatar orientation', () => {
	it('points the mouth at the orbit target', () => {
		const eye: [number, number, number] = [0, 25, 0];
		const target: [number, number, number] = [0, 0, 0];
		const stub = 3;
		const group = placeAvatar(eye, target, stub);

		// the geometry's mouth centre is at local (0, 0, -1)
		const mouth = new THREE.Vector3(0, 0, -1).applyMatrix4(group.matrixWorld);

		// a bird's-eye camera's frustum must open straight down toward the felt
		expect(mouth.x).toBeCloseTo(0);
		expect(mouth.z).toBeCloseTo(0);
		expect(mouth.y).toBeCloseTo(25 - stub);
	});

	it('reorients as the player orbits around the table', () => {
		const stub = 2;
		// low, off to the +x side, still looking at the centre
		const group = placeAvatar([20, 5, 0], [0, 0, 0], stub);
		const mouth = new THREE.Vector3(0, 0, -1).applyMatrix4(group.matrixWorld);

		// the mouth sits `stub` units along the eye→target direction
		const expected = new THREE.Vector3(0, 0, 0)
			.sub(new THREE.Vector3(20, 5, 0))
			.normalize()
			.multiplyScalar(stub)
			.add(new THREE.Vector3(20, 5, 0));
		expect(mouth.distanceTo(expected)).toBeLessThan(1e-6);
	});

	it('keeps the mouth well short of the far plane so it cannot swallow the board', () => {
		// TableCamera's maxDistance is 40; the avatar's stub never approaches it
		const { halfWidth } = frustumHalfExtents(3);
		expect(halfWidth * 2).toBeLessThan(4); // narrower than a few card widths
	});
});
