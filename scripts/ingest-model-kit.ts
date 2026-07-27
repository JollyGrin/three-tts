/// <reference types="bun-types" />
/**
 * Repackage a CC0 model kit into the first-party catalog (tableplace-135).
 * A repo tool, never runtime: kit directory in → normalized self-contained
 * GLBs + thumbnails under `static/models/<kit-id>/` + a merged entry in
 * `static/models/catalog.json`.
 *
 * Normalization, per docs/research/raw-tts-3d-models-gltf.md:
 * - embed external textures (Kenney GLBs reference `Textures/colormap.png` by
 *   URI — the shipped file must be one request, one cache entry);
 * - dedup + prune, single buffer;
 * - refuse unknown extensions (allowlist below) and >100k-vertex models —
 *   curation is the validation pipeline for now, so the curator's tool is
 *   where the budget is enforced;
 * - measure the footprint (kit grid units → catalog cells) and the pivot's
 *   Y-minimum, which becomes the manifest `yOffset` for the end-anchored
 *   exceptions (stairs, corridor-transition).
 *
 * License metadata is required on the command line: a kit without an explicit
 * license/credit/link never enters the manifest.
 *
 *   bun scripts/ingest-model-kit.ts <kit-dir> \
 *     --id kenney-cave --name "Modular Cave Kit" \
 *     --grid 4 --scale 0.5 \
 *     --license CC0-1.0 --credit "Kenney (www.kenney.nl)" \
 *     --link https://kenney.nl/assets/modular-cave-kit
 *
 * `<kit-dir>` is the unzipped kit; GLBs are found under `Models/GLB format/`
 * (Kenney's layout) or directly in the directory, thumbnails under
 * `Previews/<model>.png` when present.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
	copyFileSync
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
	dedup,
	getBounds,
	getSceneVertexCount,
	prune,
	VertexCountMethod
} from '@gltf-transform/functions';
import type { ModelCatalog, ModelCatalogEntry, ModelCatalogKit } from '../src/lib/models/catalog';

const root = resolve(import.meta.dirname, '..');
const CATALOG_PATH = resolve(root, 'static/models/catalog.json');

/** SPEC.md:118 — the per-model budget; the runtime guard mirrors it. */
const MAX_VERTICES = 100_000;

/**
 * Extensions a curated model may use. KHR_texture_transform is the one the
 * Kenney UnityGLTF exports actually carry (three.js-native); anything else is
 * a reason to look at the file, not to ship it.
 */
const EXTENSION_ALLOWLIST = new Set(['KHR_texture_transform']);

/** Browser grouping, derived from Kenney's naming convention. */
function categoryOf(name: string): string {
	if (name.startsWith('corridor')) return 'corridors';
	if (name.startsWith('room')) return 'rooms';
	if (name.startsWith('gate')) return 'gates';
	if (name.startsWith('template')) return 'templates';
	return 'props';
}

function parseArgs(argv: string[]) {
	const flags: Record<string, string> = {};
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith('--')) flags[arg.slice(2)] = argv[++i] ?? '';
		else positional.push(arg);
	}
	return { flags, positional };
}

function requireFlag(flags: Record<string, string>, name: string): string {
	const value = flags[name]?.trim();
	if (!value) {
		console.error(`Missing required --${name}. License/credit metadata is not optional here.`);
		process.exit(1);
	}
	return value;
}

const { flags, positional } = parseArgs(process.argv.slice(2));
const kitDir = positional[0];
if (!kitDir || !existsSync(kitDir)) {
	console.error('Usage: bun scripts/ingest-model-kit.ts <kit-dir> --id <kit-id> … (see header)');
	process.exit(1);
}

const kitId = requireFlag(flags, 'id');
const kitName = requireFlag(flags, 'name');
const license = requireFlag(flags, 'license');
const credit = requireFlag(flags, 'credit');
const link = requireFlag(flags, 'link');
/** the kit's own grid unit (Modular series: 4.0) — footprints divide by this */
const gridUnit = Number(flags.grid ?? '4');
/** kit units → world units (manifest carries it; 1 cell = 2.0 world) */
const scale = Number(flags.scale ?? String(2 / gridUnit));
if (!Number.isFinite(gridUnit) || gridUnit <= 0 || !Number.isFinite(scale) || scale <= 0) {
	console.error(`--grid (${flags.grid}) and --scale (${flags.scale}) must be positive numbers`);
	process.exit(1);
}

const glbDirCandidates = [join(kitDir, 'Models', 'GLB format'), kitDir];
const glbDir = glbDirCandidates.find(
	(dir) => existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.glb'))
);
if (!glbDir) {
	console.error(`No .glb files found under ${glbDirCandidates.join(' or ')}`);
	process.exit(1);
}
const previewsDir = join(kitDir, 'Previews');

const outDir = resolve(root, 'static/models', kitId);
const thumbsDir = join(outDir, 'thumbs');
mkdirSync(thumbsDir, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const models: Record<string, ModelCatalogEntry> = {};
const failures: string[] = [];

for (const file of readdirSync(glbDir)
	.filter((f) => f.endsWith('.glb'))
	.sort()) {
	const name = basename(file, '.glb');
	const document = await io.read(join(glbDir, file));

	const unknown = document
		.getRoot()
		.listExtensionsUsed()
		.map((extension) => extension.extensionName)
		.filter((extensionName) => !EXTENSION_ALLOWLIST.has(extensionName));
	if (unknown.length) {
		failures.push(`${name}: uses extensions outside the allowlist: ${unknown.join(', ')}`);
		continue;
	}

	// normalize: merge duplicate accessors/textures, drop unused properties.
	// Writing binary re-embeds every resource (the external colormap included)
	// into the single GLB buffer.
	await document.transform(dedup(), prune());

	const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
	if (!scene) {
		failures.push(`${name}: no scene`);
		continue;
	}

	const vertices = getSceneVertexCount(scene, VertexCountMethod.RENDER);
	if (vertices > MAX_VERTICES) {
		failures.push(`${name}: ${vertices} vertices exceeds the ${MAX_VERTICES} budget`);
		continue;
	}
	// triangle estimate for the manifest: indexed triangle lists throughout
	const triangles = document
		.getRoot()
		.listMeshes()
		.flatMap((mesh) => mesh.listPrimitives())
		.reduce((sum, primitive) => {
			const indices = primitive.getIndices();
			const count = indices
				? indices.getCount()
				: (primitive.getAttribute('POSITION')?.getCount() ?? 0);
			return sum + Math.floor(count / 3);
		}, 0);

	const bbox = getBounds(scene);
	const sizeX = bbox.max[0] - bbox.min[0];
	const sizeZ = bbox.max[2] - bbox.min[2];
	const cells: [number, number] = [
		Math.max(1, Math.round(sizeX / gridUnit)),
		Math.max(1, Math.round(sizeZ / gridUnit))
	];
	// pivots are Y=0-at-floor except the end-anchored pieces; when geometry
	// dips BELOW the pivot floor, the manifest lift rests it on the felt. A
	// positive minimum is left alone — gate-overhang floats above its opening
	// on purpose.
	const minY = bbox.min[1];
	const yOffset = minY < -0.01 ? Math.round(-minY * 1000) / 1000 : 0;

	const glb = await io.writeBinary(document);
	writeFileSync(join(outDir, file), glb);

	const preview = join(previewsDir, `${name}.png`);
	const thumb = `thumbs/${name}.png`;
	if (existsSync(preview)) {
		copyFileSync(preview, join(thumbsDir, `${name}.png`));
	} else {
		failures.push(`${name}: no pre-rendered thumbnail at ${preview}`);
		continue;
	}

	models[name] = {
		file,
		thumb,
		category: categoryOf(name),
		cells,
		...(yOffset !== 0 ? { yOffset } : {}),
		vertices,
		triangles
	};
	console.log(
		`${name}: ${cells[0]}×${cells[1]} cells, ${vertices} verts, ${(glb.byteLength / 1024).toFixed(0)} KB` +
			(yOffset ? `, yOffset ${yOffset}` : '')
	);
}

if (failures.length) {
	console.error(`\n${failures.length} model(s) refused:\n  ${failures.join('\n  ')}`);
	process.exit(1);
}

const kit: ModelCatalogKit = {
	name: kitName,
	base: `/models/${kitId}/`,
	scale,
	license,
	credit,
	link,
	models
};

const catalog: ModelCatalog = existsSync(CATALOG_PATH)
	? (JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as ModelCatalog)
	: { kits: {} };
catalog.kits[kitId] = kit;
writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, '\t') + '\n');
console.log(
	`\nwrote ${Object.keys(models).length} models to static/models/${kitId}/ + catalog.json`
);
