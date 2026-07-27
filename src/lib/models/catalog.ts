/**
 * The curated 3D model catalog behind the `model:` face-ref scheme
 * (tableplace-135). A `kind: 'model'` piece carries one opaque ref,
 * `model:<kit>/<name>` — this module is where that string becomes a URL, a
 * scale, and a footprint, via the static manifest the ingest script
 * (`scripts/ingest-model-kit.ts`) writes next to the models it repackages.
 *
 * The manifest is the validation surface: face refs themselves are never
 * validated anywhere (a non-empty string is the only check the pack parser
 * makes), so a malformed or unknown ref stays harmless until it fails to
 * resolve here — and then it fails visibly, as a placeholder on the table.
 *
 * Relative imports, no `$lib`, no svelte: the ingest script (a bun repo tool)
 * imports these types too — same rule as `packs/types.ts`.
 */

/** 1 catalog cell = one card length in world units; the table is 60×30. */
export const MODEL_CELL_WORLD = 2.0;

/**
 * Per-model vertex budget (SPEC.md §render budgets). Enforced twice: the
 * ingest script refuses to package a model over it, and the runtime loader
 * re-checks after load — cheap insurance even for curated files.
 */
export const MODEL_MAX_VERTICES = 100_000;

export const MODEL_REF_PREFIX = 'model:';

/** Where the manifest is served from (and written to, under `static/`). */
export const MODEL_CATALOG_URL = '/models/catalog.json';

export type ModelCatalogEntry = {
	/** GLB path relative to the kit's `base` */
	file: string;
	/** thumbnail path relative to the kit's `base` — always a pre-rendered PNG */
	thumb: string;
	/** browser grouping: corridors / rooms / gates / templates / props */
	category: string;
	/**
	 * Nominal footprint in catalog cells `[x, z]`, before yaw. Derived from the
	 * measured bounding box at ingest, so a room that claims 5×5 cells actually
	 * spans them.
	 */
	cells: [number, number];
	/**
	 * Lift, in KIT units (applied inside the kit-scale transform), that puts the
	 * model's lowest geometry at the floor. 0 for the well-behaved majority
	 * (Y=0-at-floor pivots); the end-anchored exceptions (stairs,
	 * corridor-transition) get their measured correction here.
	 */
	yOffset?: number;
	/** measured at ingest — the runtime budget guard re-checks after load */
	vertices: number;
	triangles: number;
};

export type ModelCatalogKit = {
	/** display name, e.g. 'Modular Cave Kit' */
	name: string;
	/** URL prefix every `file`/`thumb` resolves against, e.g. '/models/kenney-cave/' */
	base: string;
	/** kit units → world units (the Modular series' 4.0 grid → 2.0 cells = 0.5) */
	scale: number;
	/** SPDX-ish license id; the ingest script requires it (curated CC0 only) */
	license: string;
	/** attribution line the catalog header shows — text only, never a logo */
	credit: string;
	/** where the kit came from */
	link: string;
	models: { [modelName: string]: ModelCatalogEntry };
};

export type ModelCatalog = {
	kits: { [kitId: string]: ModelCatalogKit };
};

/** A resolved ref: everything the renderer and the drop logic need. */
export type ResolvedModelRef = {
	kitId: string;
	modelName: string;
	kit: ModelCatalogKit;
	entry: ModelCatalogEntry;
	/** absolute URL of the repackaged GLB */
	url: string;
	/** absolute URL of the pre-rendered thumbnail */
	thumbUrl: string;
	/** world-units scale the placed scene graph gets */
	scale: number;
	/** world-units footprint `[x, z]` at yaw 0 */
	footprint: [number, number];
};

/**
 * Take a `model:<kit>/<name>` ref apart. Returns null for anything else —
 * including a `model:` ref missing either half, which is how the callers
 * distinguish "not this scheme" from "this scheme, malformed" (both render
 * the placeholder; neither throws).
 */
export function parseModelRef(
	ref: string | undefined | null
): { kit: string; name: string } | null {
	if (!ref?.startsWith(MODEL_REF_PREFIX)) return null;
	const body = ref.slice(MODEL_REF_PREFIX.length);
	const slash = body.indexOf('/');
	if (slash <= 0 || slash === body.length - 1) return null;
	return { kit: body.slice(0, slash), name: body.slice(slash + 1) };
}

export function makeModelRef(kit: string, name: string): string {
	return `${MODEL_REF_PREFIX}${kit}/${name}`;
}

/**
 * Resolve a ref through a manifest. Null when the ref is malformed or names a
 * kit/model the manifest doesn't carry — the caller shows the placeholder.
 */
export function resolveModelRef(
	catalog: ModelCatalog | null | undefined,
	ref: string | undefined | null
): ResolvedModelRef | null {
	const parsed = parseModelRef(ref);
	if (!parsed || !catalog) return null;
	const kit = catalog.kits[parsed.kit];
	const entry = kit?.models[parsed.name];
	if (!kit || !entry) return null;
	return {
		kitId: parsed.kit,
		modelName: parsed.name,
		kit,
		entry,
		url: kit.base + entry.file,
		thumbUrl: kit.base + entry.thumb,
		scale: kit.scale,
		footprint: [entry.cells[0] * MODEL_CELL_WORLD, entry.cells[1] * MODEL_CELL_WORLD]
	};
}

/**
 * Footprint circumradius in world units — what a model piece's `radius`
 * (footprint circle, drop preview) is set to when it spawns.
 */
export function modelFootprintRadius(resolved: ResolvedModelRef): number {
	const [w, d] = resolved.footprint;
	return Math.round((Math.hypot(w, d) / 2) * 100) / 100;
}
