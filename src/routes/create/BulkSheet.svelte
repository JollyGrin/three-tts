<script lang="ts">
	import { Button, Element, Folder, Pane, Stepper, Text, Textarea } from 'svelte-tweakpane-ui';
	import toast from 'svelte-french-toast';
	import { sliceCell } from '$lib/tts/slice';
	import type { PackCardDef } from '$lib/packs/types';
	import { SHEET_DEFAULTS } from './face-ref';
	import {
		applyBulkNames,
		buildBulkCards,
		enumerateCells,
		planCodes,
		BULK_CODE_PREFIX,
		BULK_MAX_CELLS,
		type BulkCell
	} from './bulk-sheet';

	/**
	 * Bulk add: define a sheet's grid once, then add every cell as a card.
	 *
	 * The pane owns the grid it loaded (`loaded`), not the fields above it —
	 * retyping the columns doesn't silently re-index the thumbnails you're
	 * looking at, you press "Load grid" again. Slicing is preview only: a cell
	 * that can't be read is still a valid ref, so it stays addable and the
	 * table falls back exactly as it would at play time.
	 */
	let {
		deckSlot,
		takenCodes = [],
		onadd
	}: {
		/** slot of the deck the cards land in, for the button's label */
		deckSlot?: string;
		/** codes already used in that deck — the batch de-duplicates against them */
		takenCodes?: string[];
		onadd: (cards: PackCardDef[]) => void;
	} = $props();

	const NAMES_PLACEHOLDER =
		'One name per line, top-left first.\nCells you type into keep their own name.';

	let url = $state('');
	let cols = $state(SHEET_DEFAULTS.cols);
	let rows = $state(SHEET_DEFAULTS.rows);
	let codePrefix = $state(BULK_CODE_PREFIX);
	let namesText = $state('');
	let rangeFrom = $state(0);
	let rangeTo = $state(0);

	/** the grid as it was loaded — the source of truth for every built ref */
	let loaded: { url: string; cols: number; rows: number } | null = $state(null);
	let cells: BulkCell[] = $state([]);
	/** bumped per load so a slower previous load can't write over a newer grid */
	let generation = 0;

	const resolved = $derived(applyBulkNames(cells, namesText));
	const planned = $derived(planCodes(resolved, { prefix: codePrefix, taken: takenCodes }));
	const included = $derived(resolved.filter((cell) => cell.include).length);

	async function loadGrid() {
		const sheetUrl = url.trim();
		if (!sheetUrl) return toast.error('Paste a sheet URL first');

		const c = Math.max(1, Math.round(cols));
		const r = Math.max(1, Math.round(rows));
		if (c * r > BULK_MAX_CELLS) {
			return toast.error(`${c}×${r} is ${c * r} cells — ${BULK_MAX_CELLS} is the most at once`);
		}

		loaded = { url: sheetUrl, cols: c, rows: r };
		cells = enumerateCells(c, r);
		rangeFrom = 0;
		rangeTo = c * r - 1;

		// a few at a time: the memory + IndexedDB caches make a re-load instant,
		// but a cold 70-cell sheet should not open 70 canvases in one frame
		const gen = ++generation;
		let cursor = 0;
		let failed = 0;
		const worker = async () => {
			while (cursor < c * r) {
				const index = cursor++;
				const thumb = await sliceCell({ url: sheetUrl, cols: c, rows: r, index });
				if (gen !== generation) return;
				cells[index].thumb = thumb;
				cells[index].loading = false;
				if (!thumb) failed++;
			}
		};
		await Promise.all(Array.from({ length: Math.min(8, c * r) }, worker));
		if (gen !== generation) return;

		if (failed > 0) {
			toast(
				`${failed} of ${c * r} cells couldn't be previewed — the host blocks canvas reads, or ` +
					`the link is dead. They're still addable; the table falls back the same way.`,
				{ duration: 7000 }
			);
		}
	}

	function setAll(include: boolean) {
		for (const cell of cells) cell.include = include;
	}

	/** include exactly `rangeFrom … rangeTo` — the fast way past a dead last row */
	function includeRangeOnly() {
		const from = Math.min(rangeFrom, rangeTo);
		const to = Math.max(rangeFrom, rangeTo);
		for (const cell of cells) cell.include = cell.index >= from && cell.index <= to;
	}

	function addCards() {
		if (!loaded) return toast.error('Load the grid first');
		const cards = buildBulkCards({
			...loaded,
			cells: resolved,
			prefix: codePrefix,
			taken: takenCodes
		});
		if (!cards.length) return toast.error('No cells are included');
		onadd(cards);
	}
</script>

<Pane
	position="draggable"
	title="Bulk add from sheet"
	expanded={true}
	y={8}
	x={680}
	width={340}
	localStoreId="create-pane-bulk"
>
	<Text label="Sheet URL" bind:value={url} />
	<Stepper label="Columns" bind:value={cols} min={1} step={1} />
	<Stepper label="Rows" bind:value={rows} min={1} step={1} />
	<Button title="Load grid" on:click={loadGrid} />

	<!--
		One `Element` blade, always mounted, its contents driven by expressions:
		an `{#if}` that swaps one blade for another tears the pane down (tweakpane
		owns that DOM, Svelte doesn't). Adding blades — the folders below — is
		fine; replacing them is not.
	-->
	<Element>
		<div class={cells.length ? 'hidden' : 'p-1 font-sans text-[11px] leading-snug text-white/50'}>
			Paste a sprite sheet, say how many columns and rows it has, and every cell becomes a card —
			named in bulk, one per line. Cells that can't be previewed still import.
		</div>
		<div class={cells.length ? 'max-h-64 overflow-y-auto rounded bg-black/25 p-1' : 'hidden'}>
			<div class="grid gap-1" style="grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));">
				{#each cells as cell, i (cell.index)}
					<div
						class="rounded border p-1 font-sans {cell.include
							? 'border-white/25 bg-white/5'
							: 'border-transparent opacity-40'}"
					>
						<label class="relative block cursor-pointer">
							<input
								type="checkbox"
								class="absolute top-1 right-1 z-10 h-3 w-3 accent-emerald-400"
								data-testid="bulk-include-{cell.index}"
								bind:checked={cell.include}
							/>
							<!-- the thumb is a background image so the tile keeps its shape
									 whether or not the cell could be sliced -->

							<div
								class="flex aspect-[3/4] w-full items-center justify-center rounded bg-white/10 bg-cover bg-center px-1 text-center text-[9px] leading-tight text-white/50"
								data-testid="bulk-thumb-{cell.index}"
								style={cell.thumb ? `background-image: url("${cell.thumb}")` : ''}
							>
								{cell.thumb ? '' : cell.loading ? 'slicing…' : 'no preview'}
							</div>
							<span
								class="absolute top-0 left-0 rounded-br bg-black/70 px-1 font-mono text-[9px] text-white/80"
								>{cell.index}</span
							>
						</label>
						<input
							class="mt-1 w-full rounded bg-black/40 px-1 py-0.5 font-mono text-[10px] text-white/90"
							placeholder="code"
							data-testid="bulk-code-{cell.index}"
							value={planned.get(cell.index) ?? ''}
							oninput={(event) => {
								cell.code = event.currentTarget.value;
								cell.codeTouched = true;
							}}
						/>
						<input
							class="mt-0.5 w-full rounded bg-black/40 px-1 py-0.5 text-[10px] text-white/90"
							placeholder="name"
							data-testid="bulk-name-{cell.index}"
							value={resolved[i]?.name ?? ''}
							oninput={(event) => {
								cell.name = event.currentTarget.value;
								cell.nameTouched = true;
							}}
						/>
					</div>
				{/each}
			</div>
		</div>
	</Element>

	{#if cells.length}
		<Folder title="Include ({included} of {cells.length})" expanded={true}>
			<Button title="Include all" on:click={() => setAll(true)} />
			<Button title="Include none" on:click={() => setAll(false)} />
			<Stepper label="From cell" bind:value={rangeFrom} min={0} step={1} />
			<Stepper label="To cell" bind:value={rangeTo} min={0} step={1} />
			<Button title="Include only this range" on:click={includeRangeOnly} />
		</Folder>

		<Folder title="Names & codes" expanded={true}>
			<Textarea bind:value={namesText} rows={5} placeholder={NAMES_PLACEHOLDER} />
			<Text label="Code prefix" bind:value={codePrefix} />
		</Folder>

		<Button
			title="Add {included} card{included === 1 ? '' : 's'} to {deckSlot ?? '(no deck)'}"
			on:click={addCards}
		/>
	{/if}
</Pane>
