<script lang="ts">
	import { untrack } from 'svelte';
	import { AutoValue, Folder, List, Monitor, Text } from 'svelte-tweakpane-ui';
	import { buildFaceRef, parseFaceRef, FACE_SCHEME_OPTIONS, type FaceDraft } from './face-ref';
	import RefThumb from './RefThumb.svelte';

	/**
	 * Inline face authoring for whatever the pane is editing right now — a
	 * card's `face` or a deck's `back`. Pick the scheme, fill the fields, and
	 * the ref is written straight back: there is no apply button, and nothing
	 * to know about a builder somewhere else in the editor.
	 *
	 * State is seeded from `value` once, so the parent must key this component
	 * on the entity being edited (`{#key deckIndex + ':' + cardIndex}`) to
	 * re-seed it when the cursor moves. Writes are guarded against the value it
	 * last produced, so a ref changed from outside never gets clobbered by a
	 * stale field.
	 *
	 * `disabled` greys the whole editor without unmounting it, which is how the
	 * pane holds its height over a deck with no cards to edit (#109).
	 */
	let {
		value,
		title = 'Face',
		disabled = false,
		onchange
	}: {
		value: string;
		title?: string;
		disabled?: boolean;
		onchange: (ref: string) => void;
	} = $props();

	// deliberately read once: these fields are seeded from the ref, then own it
	const initial = untrack(() => parseFaceRef(value));
	let scheme = $state(initial.scheme);
	let url = $state(initial.url);
	let genCode = $state(initial.genCode);
	let sheetUrl = $state(initial.sheetUrl);
	let sheetCols = $state(initial.sheetCols);
	let sheetRows = $state(initial.sheetRows);
	let sheetIndex = $state(initial.sheetIndex);

	const draft: FaceDraft = $derived({
		scheme,
		url,
		genCode,
		sheetUrl,
		sheetCols,
		sheetRows,
		sheetIndex,
		sheetExtra: initial.sheetExtra
	});
	const built = $derived(buildFaceRef(draft));

	let lastBuilt = buildFaceRef(initial);
	$effect(() => {
		if (built === lastBuilt) return;
		lastBuilt = built;
		onchange(built);
	});
</script>

<Folder {title} expanded={true}>
	<List label="Scheme" bind:value={scheme} options={FACE_SCHEME_OPTIONS} {disabled} />
	{#if scheme === 'url'}
		<Text label="Image URL" bind:value={url} {disabled} />
	{:else if scheme === 'gen'}
		<Text label="Code (AS…KC, back)" bind:value={genCode} {disabled} />
	{:else}
		<Text label="Sheet URL" bind:value={sheetUrl} {disabled} />
		<AutoValue label="Columns" bind:value={sheetCols} {disabled} />
		<AutoValue label="Rows" bind:value={sheetRows} {disabled} />
		<AutoValue label="Cell index" bind:value={sheetIndex} {disabled} />
	{/if}
	<!--
		The ref row stays: it is the string you copy, and the thumbnail is not
		something you can paste into another card. A `Monitor` rather than a
		permanently-disabled `Text` (#115) — it is derived from the fields above
		and can never be typed into, and a greyed-out input reads as "you are not
		allowed to edit this" rather than "this is the output". It still takes
		`disabled`, so it dims with the rest of the block when there is nothing to
		edit (#109) instead of looking the same either way.
	-->
	<Monitor label="Ref" value={built} {disabled} />
	<!-- dimmed with the rest of the block when there is nothing to edit: the ref
	     it is previewing is then the seed for the NEXT card, not art on the table -->
	<RefThumb value={built} label={title.toLowerCase()} dimmed={disabled} />
</Folder>
