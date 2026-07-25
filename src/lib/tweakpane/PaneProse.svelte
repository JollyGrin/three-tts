<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import type { Writable } from 'svelte/store';

	/**
	 * Real HTML inside a tweakpane pane — the help/prose blade #115 needs.
	 *
	 * `svelte-tweakpane-ui`'s own `<Element>` is meant for exactly this and is
	 * what /create uses (`BulkSheet.svelte`, `CreatePane.svelte`), but it only
	 * works in a `position="inline"` pane. In a `position="draggable"` one its
	 * contents never make it into the pane at all: `<Element>` moves its slot
	 * into the blade from a Svelte 4 `$:` statement that, in a draggable pane,
	 * never re-runs once the blade ref lands — the markup is left stranded in the
	 * pane's container, which is the "the title bar drew straight through it"
	 * symptom #113 hit in `PaneDecks.svelte`. Verified on localhost before this
	 * component existed: 0 of 5 `<Element>`s on /play had been moved into the
	 * pane, against 1 of 1 on /create.
	 *
	 * So this does the same job through the same tweakpane contract, but drives
	 * the move from an `$effect`, which re-runs whenever the blade is recreated.
	 *
	 * Same swap hazard as everything else here (`BulkSheet.svelte:135-140`): keep
	 * one of these mounted and drive its contents by expression rather than
	 * wrapping it in an `{#if}` that replaces a blade.
	 */

	type Blade = { element: HTMLElement; dispose: () => void };
	type BladeContainer = { addBlade: (options: Record<string, unknown>) => Blade };

	let { children }: { children: Snippet } = $props();

	// the container (Pane or Folder) that mounts us — the same context
	// svelte-tweakpane-ui hands to its own blades
	const parentStore = getContext<Writable<BladeContainer | undefined>>('parentStore');

	// a zero-size marker left in Svelte's DOM: its position among its siblings is
	// where this blade belongs in the pane
	let marker = $state<HTMLDivElement>();
	let source = $state<HTMLDivElement>();

	/** siblings before the marker, minus the ones that aren't blades themselves */
	function bladeIndex(el: HTMLElement): number {
		let index = 0;
		for (let s = el.previousElementSibling; s !== null; s = s.previousElementSibling) {
			if (!s.classList.contains('skip-element-index')) index++;
		}
		return index;
	}

	// An explicit subscription rather than `$effect(() => $parentStore)`: a
	// `<Folder>` hands its children an empty store and only fills it in once its
	// own blade exists, and that late write is exactly the update the auto-
	// subscription missed — the bug this component is here to avoid.
	$effect(() => {
		if (!marker || !source) return;
		const anchor = marker;
		const content = source;
		let blade: Blade | undefined;

		const unsubscribe = parentStore.subscribe((container) => {
			blade?.dispose();
			blade = undefined;
			if (!container) return;
			blade = container.addBlade({ index: bladeIndex(anchor), view: 'separator' });
			blade.element.replaceChildren(content);
		});

		return () => {
			unsubscribe();
			blade?.dispose();
		};
	});
</script>

<div bind:this={marker} style="display: none;"></div>
<!--
	`skip-element-index` keeps this out of the blade count while it is still
	sitting in Svelte's DOM, so the blades after it don't land one row too low.
-->
<div bind:this={source} class="skip-element-index tp-prose">
	{@render children()}
</div>

<style>
	/* line the prose up with the blades above it, which are inset by the
	   container's horizontal padding */
	.tp-prose {
		padding-right: var(--cnt-hp);
		padding-left: var(--cnt-hp);
	}
</style>
