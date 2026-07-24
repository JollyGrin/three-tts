<script lang="ts">
	import { Button, Pane, Element, TabGroup, TabPage, Point } from 'svelte-tweakpane-ui';
	import { gameActions } from '$lib/store/game/actions';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { spawnPack, STANDARD_52 } from '$lib/packs';
	import { importTtsFile } from '$lib/tts/import';
	import toast from 'svelte-french-toast';

	const playerId = gameActions.getMyId();
	const myDecks = $derived(
		Object.keys($gameStore?.decks ?? {}).filter((key) => key.split(':').includes(playerId ?? ''))
	);

	let fileInput: HTMLInputElement | undefined = $state();
	let isImporting = $state(false);

	async function handleImportFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		isImporting = true;
		try {
			const report = await importTtsFile(await file.text());
			const parts = [`Imported ${report.decks} deck(s), ${report.cards} cards`];
			if (report.missingArt > 0)
				parts.push(`${report.missingArt} with dead art links (named placeholders used)`);
			if (report.skipped.length > 0)
				parts.push(`skipped ${report.skipped.length} unsupported objects`);
			toast(parts.join(' — '), { duration: 6000 });
		} catch (error) {
			toast.error(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`);
		} finally {
			isImporting = false;
			input.value = '';
		}
	}
</script>

<Pane
	position="draggable"
	title="Decks"
	expanded={true}
	y={0}
	x={310}
	width={300}
	localStoreId="table-decks"
>
	{#if myDecks.length === 0}
		<Element>
			<div class="flex w-full justify-center font-sans text-xs text-white uppercase opacity-30">
				<span class="animate-pulse"> Spawn a deck to get started </span>
			</div>
		</Element>
		<Button title="Spawn {STANDARD_52.name}" on:click={() => spawnPack(STANDARD_52)} />
	{/if}
	<Button
		title={isImporting ? 'Importing…' : 'Import TTS deck (.json)'}
		disabled={isImporting}
		on:click={() => fileInput?.click()}
	/>
	<Element>
		<input
			bind:this={fileInput}
			type="file"
			accept=".json,application/json"
			class="hidden"
			onchange={handleImportFile}
		/>
	</Element>
	<TabGroup>
		{#each myDecks as deckId}
			{@const position = $gameStore?.decks?.[deckId]?.position ?? [0, 0, 0]}
			<TabPage title={deckId?.split(':')?.[2] ?? 'Deck'}>
				<Button title="Shuffle {deckId}" on:click={() => gameActions.shuffleDeck(deckId)} />
				<Point
					label="position"
					value={[position[0], position[2]]}
					on:change={(e) => {
						//@ts-expect-error: does exist
						const x = e.detail.value?.x ?? position[0];
						//@ts-expect-error: does exist
						const y = e.detail.value?.y ?? position[2];
						gameStore.updateState({
							decks: { [deckId]: { position: [x, position[1], y] } }
						});
					}}
				/>
			</TabPage>
		{/each}
	</TabGroup>
</Pane>
