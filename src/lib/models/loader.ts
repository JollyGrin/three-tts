/**
 * GLB loading for `kind: 'model'` pieces.
 *
 * One fetch+parse per URL for the life of the page — the module-level promise
 * cache — and one cheap `clone()` per placement, so thirty corridor sections
 * cost one download and one geometry upload. Every model in a kit shares one
 * material/atlas (the ingest script guarantees the files are self-contained),
 * so texture memory for a whole cave is a single 512² upload.
 *
 * `InstancedMesh` is deliberately absent: the research cap is ~700 draw calls
 * on desktop and a full kit scene measures nowhere near it. Build that when a
 * real scene shows pressure, not before.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODEL_MAX_VERTICES, resolveModelRef, type ModelCatalog } from './catalog';

const loader = new GLTFLoader();

/** prototype scenes by URL; cloned per placement, never mounted directly */
const prototypes = new Map<string, Promise<THREE.Group>>();

function vertexCount(scene: THREE.Group): number {
	let count = 0;
	scene.traverse((node) => {
		const mesh = node as THREE.Mesh;
		if (mesh.isMesh) count += mesh.geometry.getAttribute('position')?.count ?? 0;
	});
	return count;
}

/**
 * Load (once) the prototype scene for a GLB URL. Rejects — and caches the
 * rejection's cause, not the rejection — on a vertex-budget violation, so the
 * caller falls back to the placeholder instead of uploading a pathological
 * mesh every placement.
 */
export function loadModelScene(url: string): Promise<THREE.Group> {
	let cached = prototypes.get(url);
	if (!cached) {
		cached = loader.loadAsync(url).then((gltf) => {
			const scene = gltf.scene;
			const vertices = vertexCount(scene);
			if (vertices > MODEL_MAX_VERTICES) {
				throw new Error(`${url}: ${vertices} vertices exceeds the ${MODEL_MAX_VERTICES} budget`);
			}
			scene.traverse((node) => {
				// GLB-authored node names ('room-wide_1'…) would shadow the piece
				// group's `name={id}` — the convention devtools and the render
				// harness use to attribute a raycast hit to its entity — so the
				// piece group must stay the nearest named ancestor of every mesh
				node.name = '';
				const mesh = node as THREE.Mesh;
				if (mesh.isMesh) {
					mesh.castShadow = true;
					mesh.receiveShadow = true;
				}
			});
			return scene;
		});
		// a failed load may be transient (network); let the next placement retry
		cached.catch(() => prototypes.delete(url));
		prototypes.set(url, cached);
	}
	return cached;
}

/** A fresh scene graph for one placement. Geometry/materials stay shared. */
export async function cloneModelScene(url: string): Promise<THREE.Group> {
	return (await loadModelScene(url)).clone(true);
}

/**
 * Warm the GLB cache for a `model:` ref ahead of render — the model-scheme
 * analog of `prewarmSheetRef`, called on incoming syncs so a joining client
 * starts fetching cave sections before the pieces mount.
 */
export async function prewarmModelRef(catalog: ModelCatalog | null, ref: string): Promise<boolean> {
	const resolved = resolveModelRef(catalog, ref);
	if (!resolved) return false;
	try {
		await loadModelScene(resolved.url);
		return true;
	} catch {
		return false;
	}
}
