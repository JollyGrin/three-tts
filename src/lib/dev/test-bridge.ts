/**
 * The dev-only handle the headless render harness (`e2e/`) drives the table
 * through.
 *
 * It exists because the class of failure #102 was reported for — a die or a bag
 * that poisons the shared raycast and freezes every pointer interaction on the
 * table — is invisible to jsdom: nothing there runs three.js geometry or a
 * raycast. Catching it needs a real GPU-less browser, real pointer events at
 * real pixels, and therefore a way to ask the live scene *where on screen* a
 * given entity is. That is all this is.
 *
 * Everything here is a read of live state or a call into `gameActions`, i.e.
 * exactly what the HUD panes already do — the harness spawns pieces the same
 * way a player does and then clicks them with a real mouse. Nothing in the app
 * reads this object.
 *
 * `import.meta.env.DEV` is a compile-time constant, so `installTestBridge` is
 * only ever called from a dev build (see `TestBridge.svelte`).
 */

import * as THREE from 'three';
import { get } from 'svelte/store';
import { dragStore } from '$lib/store/dragStore.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import type { GameDTO } from '$lib/store/game/types';

export type ScreenPoint = { x: number; y: number };

export type TestBridge = {
	/** set last, so the harness can poll one flag and know the scene is live */
	ready: boolean;
	actions: typeof gameActions;
	state: () => Partial<GameDTO> | undefined;
	/** world → CSS pixels within the canvas, or null when it projects off-screen */
	project: (world: [number, number, number]) => ScreenPoint | null;
	/** where a card / deck / piece currently draws, by store id */
	locate: (id: string) => ScreenPoint | null;
	/** the raycast the shared interactivity context runs, minus the dispatch */
	hits: (screen: ScreenPoint) => string[];
	/** what is being dragged / hovered right now — distinguishes "never lifted" from "lifted and snapped back" */
	drag: () => {
		isDragging: string | null;
		isHovered: string | null;
		isBagHovered: string | null;
		isDeckHovered: string | null;
	};
	/** what an entity is actually made of — null if it never mounted at all */
	describe: (id: string) => EntityShape | null;
};

/**
 * Enough of an entity's rendered form to tell "did not mount", "mounted
 * untextured" and "mounted correctly" apart. `renders white` in #102 was the
 * first of those, so `meshes: 0` and `null` are the interesting answers.
 */
export type EntityShape = {
	meshes: number;
	/** one entry per material, in traversal order */
	materials: { type: string; color: string; hasMap: boolean }[];
	/**
	 * World-space bounding-box dimensions [x, y, z] of the rendered object.
	 * What tells a landscape card (footprint wider than deep) from a portrait
	 * one — the store cannot: orientation is render-only by design.
	 */
	size: [number, number, number];
};

declare global {
	interface Window {
		__tableplace?: TestBridge;
	}
}

type SceneHandles = {
	camera: () => THREE.Camera | undefined;
	canvas: () => HTMLCanvasElement | undefined;
	scene: () => THREE.Scene | undefined;
};

/**
 * Where an entity actually *draws*, not where the store says it is.
 *
 * The two differ enough to matter: a die sits a shape-dependent distance above
 * the piece group's origin, a deck's height grows with its card count, and the
 * table camera is only near-vertical — so projecting the store position and
 * clicking there misses the mesh at the edges of the table and lands on felt.
 * The centre of the rendered bounding box is what a player aims at.
 */
function renderedCentre(scene: THREE.Scene, id: string): THREE.Vector3 | null {
	const object = scene.getObjectByName(id);
	if (!object) return null;
	const box = new THREE.Box3().setFromObject(object);
	if (box.isEmpty()) return object.getWorldPosition(new THREE.Vector3());
	return box.getCenter(new THREE.Vector3());
}

export function installTestBridge(handles: SceneHandles): void {
	const raycaster = new THREE.Raycaster();

	const project = (world: [number, number, number]): ScreenPoint | null => {
		const camera = handles.camera();
		const canvas = handles.canvas();
		if (!camera || !canvas) return null;
		const ndc = new THREE.Vector3(...world).project(camera);
		if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return null;
		const rect = canvas.getBoundingClientRect();
		return {
			x: rect.left + ((ndc.x + 1) / 2) * rect.width,
			y: rect.top + ((1 - ndc.y) / 2) * rect.height
		};
	};

	/**
	 * The same intersection the interactivity context does, reported as the ids
	 * of whatever was hit — nearest first, deduplicated. Leaf meshes are
	 * anonymous, so each hit is attributed to its nearest named ancestor, which
	 * is the entity group.
	 *
	 * A raycast that throws here throws for the real dispatch loop too, which is
	 * the point: the harness can name the broken entity rather than only observe
	 * that nothing responds.
	 */
	const hits = (screen: ScreenPoint): string[] => {
		const camera = handles.camera();
		const canvas = handles.canvas();
		const scene = handles.scene();
		if (!camera || !canvas || !scene) return [];
		const rect = canvas.getBoundingClientRect();
		raycaster.setFromCamera(
			new THREE.Vector2(
				((screen.x - rect.left) / rect.width) * 2 - 1,
				-(((screen.y - rect.top) / rect.height) * 2 - 1)
			),
			camera
		);
		const named = (object: THREE.Object3D): string => {
			for (let node: THREE.Object3D | null = object; node; node = node.parent) {
				if (node.name) return node.name;
			}
			return object.type;
		};
		return [
			...new Set(raycaster.intersectObjects(scene.children, true).map((h) => named(h.object)))
		];
	};

	window.__tableplace = {
		ready: true,
		actions: gameActions,
		state: () => get(gameStore),
		project,
		locate: (id) => {
			const scene = handles.scene();
			const centre = scene ? renderedCentre(scene, id) : null;
			return centre ? project([centre.x, centre.y, centre.z]) : null;
		},
		hits,
		drag: () => {
			const { isDragging, isHovered, isBagHovered, isDeckHovered } = get(dragStore);
			return { isDragging, isHovered, isBagHovered, isDeckHovered };
		},
		describe: (id) => {
			const object = handles.scene()?.getObjectByName(id);
			if (!object) return null;
			const box = new THREE.Box3().setFromObject(object);
			const size = box.isEmpty()
				? ([0, 0, 0] as [number, number, number])
				: (box.getSize(new THREE.Vector3()).toArray() as [number, number, number]);
			const shape: EntityShape = { meshes: 0, materials: [], size };
			object.traverse((node) => {
				const mesh = node as THREE.Mesh;
				if (!mesh.isMesh) return;
				shape.meshes++;
				for (const material of [mesh.material].flat()) {
					const standard = material as THREE.MeshStandardMaterial;
					shape.materials.push({
						type: material.type,
						color: standard.color ? `#${standard.color.getHexString()}` : '',
						hasMap: !!standard.map
					});
				}
			});
			return shape;
		}
	};
}

export function removeTestBridge(): void {
	delete window.__tableplace;
}
