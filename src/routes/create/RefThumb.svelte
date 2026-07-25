<script lang="ts">
	import { Element } from 'svelte-tweakpane-ui';
	import { resolveRefPreview, PREVIEW_DEBOUNCE_MS, type RefPreview } from './ref-preview';

	/**
	 * The resolved image, next to the ref that sets it.
	 *
	 * Authoring a face used to mean typing a string and then going to look at a
	 * 3D table to find out whether you got it right — in Deck mode, by dragging a
	 * card off a pile and flipping it, knowing the next keystroke respawns the
	 * preview and undoes all of that (#111). This is the same answer the bulk
	 * sheet already gives per cell, given to the single-ref controls.
	 *
	 * ONE `Element` blade, always mounted, its contents driven by expressions:
	 * an `{#if}` that swaps one blade for another tears the pane down, because
	 * tweakpane owns that DOM (see BulkSheet.svelte). Everything below is plain
	 * DOM inside the one element, where Svelte is free to do as it likes.
	 */
	let {
		value,
		label = 'face',
		aspect = 'card'
	}: {
		/** the ref as it currently stands — `gen:`, `sheet:`, a URL, or empty */
		value: string | undefined;
		/** what is missing when it's empty, e.g. "card face", "overlay image" */
		label?: string;
		/** the tile's shape; the art is letterboxed inside it either way */
		aspect?: 'card' | 'square' | 'wide';
	} = $props();

	const TILE = {
		card: 'aspect-[3/4] w-16',
		square: 'aspect-square w-16',
		wide: 'aspect-[4/3] w-24'
	} as const;

	let preview = $state<RefPreview>({ kind: 'empty' });
	/** set by the <img>'s own error: a resolvable ref whose art is a dead link */
	let broken = $state(false);

	$effect(() => {
		const ref = (value ?? '').trim();
		broken = false;
		if (!ref) {
			preview = { kind: 'empty' };
			return;
		}
		preview = { kind: 'pending' };
		// a ref is typed a character at a time and every prefix of a sheet URL is
		// a fetch, so the ref has to sit still before it is worth resolving
		let live = true;
		const timer = setTimeout(async () => {
			const next = await resolveRefPreview(ref);
			if (live) preview = next;
		}, PREVIEW_DEBOUNCE_MS);
		return () => {
			live = false;
			clearTimeout(timer);
		};
	});

	const src = $derived(preview.kind === 'image' ? preview.src : '');
	const failed = $derived(preview.kind === 'unresolvable' || broken);
	/**
	 * What the tile is showing, and the one thing a test needs to assert on.
	 * NOT called `state`: svelte2tsx reads `$state` as a subscription to a store
	 * named `state`, so a variable by that name breaks every rune in the file.
	 */
	const status = $derived(failed ? 'failed' : src ? 'image' : preview.kind);

	const caption = $derived(
		status === 'failed' ? 'no preview' : status === 'pending' ? 'slicing…' : 'none'
	);
	const note = $derived(
		status === 'failed'
			? 'Dead link, or the host blocks reads. The ref is still valid — the table falls back the same way.'
			: status === 'empty'
				? `No ${label} set — nothing renders on the table.`
				: ''
	);
</script>

<Element>
	<div class="flex items-center gap-2 p-1">
		<div
			class="flex shrink-0 items-center justify-center overflow-hidden rounded bg-white/10 {TILE[
				aspect
			]}"
			data-testid="ref-thumb"
			data-state={status}
		>
			{#if src && !broken}
				<!-- the ref's own URL, loaded as an image and nothing more: a host
				     that blocks canvas reads still displays fine here, and a dead
				     one lands in `onerror` rather than as a broken-image icon -->
				<img
					{src}
					alt=""
					class="max-h-full max-w-full object-contain"
					onerror={() => (broken = true)}
				/>
			{:else}
				<span class="px-1 text-center font-sans text-[9px] leading-tight text-white/50">
					{caption}
				</span>
			{/if}
		</div>
		{#if note}
			<div class="min-w-0 flex-1 font-sans text-[10px] leading-snug text-white/45">{note}</div>
		{/if}
	</div>
</Element>
