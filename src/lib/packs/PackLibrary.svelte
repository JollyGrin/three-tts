<script lang="ts">
	/**
	 * The local pack library as tweakpane controls: pick a pack, spawn it, or
	 * open a `.tbpp.json` from disk (which files it in the library and spawns it
	 * in one gesture).
	 *
	 * One component for /setup and /play so the verbs stay identical on both —
	 * *open* a file, *spawn* a pack — and so importing once is enough: every
	 * later seat, table or session spawns from the library instead of re-picking
	 * the file.
	 */
	import { Button, Element, List } from 'svelte-tweakpane-ui';
	import { get } from 'svelte/store';
	import toast from 'svelte-french-toast';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { prewarmGameState } from './prewarm-state';
	import { getLibraryPack, listLibraryPacks, saveLibraryPack } from './library';
	import { parsePackFile } from './file';
	import { spawnPack } from './spawn';
	import type { GamePackDef } from './types';

	let {
		ownerId,
		spawnTitle = 'Spawn selected',
		openTitle = 'Open a pack (.tbpp.json)',
		beforeSpawn
	}: {
		/** who owns the spawned content; omitted = the local player */
		ownerId?: string;
		spawnTitle?: string;
		openTitle?: string;
		/** run before spawning — /setup seats the placeholder that will own it */
		beforeSpawn?: () => void;
	} = $props();

	let ids = $state(listLibraryPacks().map((entry) => entry.pack.id));
	let selected = $state(listLibraryPacks()[0]?.pack.id ?? '');
	const options = $derived(
		ids.length ? Object.fromEntries(ids.map((id) => [id, id])) : { '(no packs yet)': '' }
	);

	let fileInput: HTMLInputElement | undefined = $state();

	function refresh() {
		ids = listLibraryPacks().map((entry) => entry.pack.id);
	}

	function spawn(pack: GamePackDef) {
		beforeSpawn?.();
		spawnPack(pack, ownerId ? { ownerId } : {});
		// pack content exists only in the store now — repaint its sheet refs
		void prewarmGameState(get(gameStore), () => gameStore.updateStateSilently({}));
	}

	function handleSpawn() {
		const entry = getLibraryPack(selected);
		if (!entry) return toast.error('No pack selected — open a .tbpp.json first');
		spawn(entry.pack);
		toast(`Spawned pack "${entry.pack.name}"`);
	}

	async function handleOpen(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const pack = parsePackFile(await file.text());
			// library before spawn: `spawnPack` stamps `source: 'local'` from what
			// it finds there, and that stamp is what lets a scenario reload it
			saveLibraryPack(pack);
			refresh();
			selected = pack.id;
			spawn(pack);
			toast(`Opened pack "${pack.name}" — saved to your pack library`, { duration: 5000 });
		} catch (error) {
			toast.error(
				`Could not open the pack: ${error instanceof Error ? error.message : 'invalid file'}`,
				{ duration: 6000 }
			);
		} finally {
			input.value = '';
		}
	}
</script>

<List label="Pack library" bind:value={selected} {options} />
<Button title={spawnTitle} on:click={handleSpawn} />
<Button title={openTitle} on:click={() => fileInput?.click()} />
<Element>
	<input
		bind:this={fileInput}
		type="file"
		accept=".json,application/json"
		class="hidden"
		onchange={handleOpen}
	/>
</Element>
