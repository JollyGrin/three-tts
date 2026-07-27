<!--
	The model catalog browser: thumbnail tiles per kit, grouped by category —
	click one and the section spawns in front of your seat, pulled onto a snap
	grid when one covers the spawn spot.

	Follows the BulkSheet precedent exactly (the app's only other image-grid
	picker): one always-mounted tweakpane `Element` blade whose contents are
	driven by expressions — an `{#if}` that swapped blades would tear the pane
	down — with a `data-testid` per tile for the harness.

	The header credits the kit from the manifest (`credit`/`link`) — text only,
	never a logo: CC0 needs no attribution, Kenney asks for a name-check, and
	the trademark is the one thing the license does not grant.
-->
<script lang="ts">
	import { Element, Folder } from 'svelte-tweakpane-ui';
	import { get } from 'svelte/store';
	import toast from 'svelte-french-toast';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { buildPiece } from '$lib/store/game/actions/piece';
	import { resolveSnap } from '$lib/utils/transforms/snap';
	import { modelCatalog, ensureModelCatalog } from './catalog-store';
	import { makeModelRef, MODEL_CELL_WORLD, type ModelCatalogEntry } from './catalog';

	let {
		ownerId,
		expanded = false,
		beforeSpawn
	}: {
		/** owner segment of the new piece id — `getMyId()` on /play, the seat placeholder on /setup */
		ownerId?: string;
		expanded?: boolean;
		/** run before spawning (the scenario editor ensures its seat placeholder exists) */
		beforeSpawn?: () => void;
	} = $props();

	$effect(() => {
		void ensureModelCatalog();
	});

	const kits = $derived(Object.entries($modelCatalog?.kits ?? {}));

	/** stable presentation order; anything unlisted sorts after, alphabetically */
	const CATEGORY_ORDER = ['corridors', 'rooms', 'gates', 'templates', 'props'];

	function categorized(models: { [name: string]: ModelCatalogEntry }) {
		const groups = new Map<string, [string, ModelCatalogEntry][]>();
		for (const [name, entry] of Object.entries(models)) {
			const list = groups.get(entry.category) ?? [];
			list.push([name, entry]);
			groups.set(entry.category, list);
		}
		return [...groups.entries()].sort(([a], [b]) => {
			const ia = CATEGORY_ORDER.indexOf(a);
			const ib = CATEGORY_ORDER.indexOf(b);
			return (ia === -1 ? CATEGORY_ORDER.length : ia) - (ib === -1 ? CATEGORY_ORDER.length : ib);
		});
	}

	function footprintRadius(entry: ModelCatalogEntry): number {
		const w = entry.cells[0] * MODEL_CELL_WORLD;
		const d = entry.cells[1] * MODEL_CELL_WORLD;
		return Math.round((Math.hypot(w, d) / 2) * 100) / 100;
	}

	/**
	 * Spawn one section at the seat's fan-out position — pulled onto the nearest
	 * grid cell when a snap grid covers that spot, the same transform a drop
	 * there would commit. Built and written as ONE patch (buildPiece +
	 * updateState) so the snapped position is where the piece first appears,
	 * rather than a spawn-then-teleport pair on the wire.
	 */
	function spawn(kitId: string, name: string, entry: ModelCatalogEntry) {
		beforeSpawn?.();
		const built = buildPiece('model', {
			ownerId,
			name,
			model: makeModelRef(kitId, name),
			radius: footprintRadius(entry)
		});
		if (!built) return toast.error('Could not spawn — no player id yet');
		const [x = 0, y = 0, z = 0] = built.piece.position ?? [];
		const snap = resolveSnap(get(gameStore)?.snapPoints, x, z, 0);
		if (snap) {
			built.piece.position = [snap.x, y, snap.z];
			if (snap.rotation !== undefined) built.piece.rotation = [0, snap.rotation, 0];
		}
		gameStore.updateState({ pieces: { [built.id]: built.piece } });
		toast(`Placed ${name} — drag to position, T/R to rotate`);
	}
</script>

<Folder title="Models" {expanded}>
	<Element>
		{#if kits.length === 0}
			<div class="p-1 font-sans text-[11px] leading-snug text-white/50">
				No model catalog available — the manifest at /models/catalog.json did not load.
			</div>
		{/if}
		{#each kits as [kitId, kit] (kitId)}
			<div class="p-1 font-sans">
				<!-- attribution from the manifest: name-check + link, never a logo -->
				<div class="mb-1 flex items-baseline justify-between gap-2">
					<span class="text-[11px] font-semibold text-white/80">{kit.name}</span>
					<a
						class="text-[10px] text-white/40 underline hover:text-white/70"
						href={kit.link}
						target="_blank"
						rel="noreferrer"
					>
						3D assets by {kit.credit}
					</a>
				</div>
				<div class="max-h-72 overflow-y-auto rounded bg-black/25 p-1">
					{#each categorized(kit.models) as [category, models] (category)}
						<div class="mt-1 mb-0.5 text-[10px] tracking-wider text-white/40 uppercase first:mt-0">
							{category}
						</div>
						<div
							class="grid gap-1"
							style="grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));"
						>
							{#each models as [name, entry] (name)}
								<button
									type="button"
									class="rounded border border-transparent bg-white/5 p-1 text-left hover:border-white/25 hover:bg-white/10"
									data-testid="model-tile-{kitId}-{name}"
									title="{name} — {entry.cells[0]}×{entry.cells[1]} cells"
									onclick={() => spawn(kitId, name, entry)}
								>
									<div
										class="aspect-square w-full rounded bg-white/10 bg-contain bg-center bg-no-repeat"
										style={`background-image: url("${kit.base + entry.thumb}")`}
									></div>
									<div class="mt-0.5 truncate text-[9px] leading-tight text-white/70">{name}</div>
								</button>
							{/each}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</Element>
</Folder>
