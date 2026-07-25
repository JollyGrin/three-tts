<script lang="ts">
	import {
		Button,
		Pane,
		Element,
		Folder,
		List,
		Text,
		Textarea,
		Point,
		Wheel,
		AutoValue,
		Checkbox,
		TabGroup,
		TabPage
	} from 'svelte-tweakpane-ui';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { gameActions } from '$lib/store/game/actions';
	import { cameraTransforms } from '$lib/utils/transforms/camera';
	import { importTtsFile } from '$lib/tts/import';
	import { spawnPack, STANDARD_52 } from '$lib/packs';
	import {
		saveScenario,
		listScenarios,
		getScenario,
		deleteScenario,
		applyScenario,
		ensureSeatPlaceholder,
		seatPlaceholderId,
		isSeatPlaceholder,
		exportScenarioToFile,
		importScenarioFromText,
		type SeatIndex
	} from '$lib/scenario/scenario';
	import HUDPieces from '$lib/HUDPieces.svelte';
	import { purgeUndefinedValues } from '$lib/utils/transforms/data';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import type { GameDTO } from '$lib/store/game/types';
	import toast from 'svelte-french-toast';

	let activeSeat: SeatIndex = $state(0);
	const seatOptions = { 'Seat 0 (near)': 0, 'Seat 1 (far)': 1, 'Seat 2': 2, 'Seat 3': 3 };

	let deckFileInput: HTMLInputElement | undefined = $state();
	let scenarioFileInput: HTMLInputElement | undefined = $state();
	let isImporting = $state(false);

	let scenarioName = $state('my-scenario');
	let selectedScenario = $state(listScenarios()[0]?.name ?? '');
	let scenarioNames = $state(listScenarios().map((s) => s.name));
	const scenarioOptions = $derived(
		scenarioNames.length
			? Object.fromEntries(scenarioNames.map((n) => [n, n]))
			: { '(none saved)': '' }
	);

	function refreshScenarios() {
		scenarioNames = listScenarios().map((s) => s.name);
	}

	async function handleImportDeck(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		isImporting = true;
		try {
			ensureSeatPlaceholder(activeSeat);
			const report = await importTtsFile(await file.text(), {
				ownerId: seatPlaceholderId(activeSeat),
				mirror: activeSeat === 1
			});
			toast(`Seat ${activeSeat}: imported ${report.decks} deck(s), ${report.cards} cards`, {
				duration: 5000
			});
		} catch (error) {
			toast.error(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`);
		} finally {
			isImporting = false;
			input.value = '';
		}
	}

	function viewFromSeat() {
		gameActions.setSeat(activeSeat);
		cameraTransforms.resetView();
	}

	function handleSave() {
		const name = scenarioName.trim();
		if (!name) return toast.error('Name the scenario first');
		saveScenario(name);
		refreshScenarios();
		selectedScenario = name;
		toast(`Saved scenario: ${name}`);
	}

	async function handleLoad() {
		const scenario = getScenario(selectedScenario);
		if (!scenario) return toast.error('Pick a saved scenario first');
		const report = await applyScenario(scenario);
		scenarioName = scenario.name;
		// reflect the loaded overlay in the controls (read from the store: a v2
		// scenario's overlay may have come from a pack, not from `state`)
		const overlay = $gameStore?.overlays?.table;
		imageUrl = overlay?.imageUrl ?? '';
		scale = overlay?.scale ?? 12;
		rot = (overlay?.rotation?.[1] ?? 0) / DEG2RAD;
		point3d = { x: overlay?.position?.[0] ?? 0, y: overlay?.position?.[2] ?? 0 };
		for (const { id, reason } of report.failedPacks) {
			toast.error(`Pack '${id}' failed to load: ${reason}`, { duration: 6000 });
		}
		toast(`Loaded: ${scenario.name}`);
	}

	/** Put pack content on the table for the active seat — the v2 authoring flow. */
	function handleSpawnStandard52() {
		ensureSeatPlaceholder(activeSeat);
		spawnPack(STANDARD_52, { ownerId: seatPlaceholderId(activeSeat) });
		toast(`Seat ${activeSeat}: spawned ${STANDARD_52.name}`);
	}

	function handleDelete() {
		if (!selectedScenario) return;
		deleteScenario(selectedScenario);
		refreshScenarios();
		selectedScenario = scenarioNames[0] ?? '';
	}

	function handleExport() {
		const scenario = getScenario(selectedScenario);
		if (!scenario) return toast.error('Pick a saved scenario first');
		exportScenarioToFile(scenario);
	}

	async function handleImportScenarioFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const scenario = importScenarioFromText(await file.text());
			refreshScenarios();
			selectedScenario = scenario.name;
			toast(`Imported scenario: ${scenario.name}`);
		} catch (error) {
			toast.error(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`);
		} finally {
			input.value = '';
		}
	}

	function clearTable() {
		const s = $gameStore;
		const update: Record<string, Record<string, null>> = {
			cards: {},
			decks: {},
			pieces: {},
			overlays: {},
			players: {}
		};
		for (const collection of ['cards', 'decks', 'pieces', 'overlays'] as const) {
			for (const key of Object.keys(s?.[collection] ?? {})) update[collection][key] = null;
		}
		for (const key of Object.keys(s?.players ?? {})) {
			if (isSeatPlaceholder(key)) update.players[key] = null;
		}
		gameStore.updateState(update as Parameters<typeof gameStore.updateState>[0]);
		imageUrl = '';
	}

	// all decks on the table, any owner (placeholder seats included)
	const deckIds = $derived(
		Object.keys($gameStore?.decks ?? {}).filter((key) => $gameStore?.decks?.[key])
	);

	function setDeckField(deckId: string, patch: Record<string, unknown>) {
		gameStore.updateState({ decks: { [deckId]: patch } });
	}

	// overlay controls — same shape as the /play settings pane
	let rot = $state(0);
	let scale = $state($gameStore?.overlays?.table?.scale ?? 12);
	let point3d = $state({ x: 0, y: 0 });
	let imageUrl = $state($gameStore?.overlays?.table?.imageUrl ?? '');

	$effect(() => {
		const _imageUrl = imageUrl === '' ? undefined : imageUrl;
		gameStore.updateState({
			overlays: {
				table: purgeUndefinedValues({
					imageUrl: _imageUrl,
					rotation: [0, rot * DEG2RAD, 0],
					position: [point3d.x, 0.255, point3d.y],
					scale
				}) as NonNullable<GameDTO['overlays']>[string]
			}
		});
	});
</script>

<Pane
	position="draggable"
	title="Scenario Setup (local)"
	expanded={true}
	y={0}
	x={0}
	width={320}
	localStoreId="setup-pane"
>
	<Folder title="Seats" expanded={true}>
		<List label="Editing seat" bind:value={activeSeat} options={seatOptions} />
		<Button
			title="Spawn {STANDARD_52.name} for seat {activeSeat}"
			on:click={handleSpawnStandard52}
		/>
		<Button
			title={isImporting ? 'Importing…' : `Import TTS deck for seat ${activeSeat}`}
			disabled={isImporting}
			on:click={() => deckFileInput?.click()}
		/>
		<Button title="View table from seat {activeSeat}" on:click={viewFromSeat} />
		<Element>
			<input
				bind:this={deckFileInput}
				type="file"
				accept=".json,application/json"
				class="hidden"
				onchange={handleImportDeck}
			/>
		</Element>
	</Folder>
	{#if deckIds.length > 0}
		<Folder title="Decks" expanded={true}>
			<TabGroup>
				{#each deckIds as deckId (deckId)}
					{@const deck = $gameStore?.decks?.[deckId]}
					{@const position = deck?.position ?? [0, 0.4, 0]}
					{@const rotY = (deck?.rotation?.[1] ?? 0) / DEG2RAD}
					<TabPage title={deckId.split(':').slice(1).join(' ')}>
						<Point
							label="position"
							value={[position[0], position[2]]}
							on:change={(e) => {
								//@ts-expect-error: does exist
								const x = e.detail.value?.x ?? position[0];
								//@ts-expect-error: does exist
								const z = e.detail.value?.y ?? position[2];
								setDeckField(deckId, { position: [x, position[1], z] });
							}}
						/>
						<Wheel
							label="rotation"
							value={rotY}
							format={(v) => `${(((v % 360) + 360) % 360).toFixed(0)}°`}
							on:change={(e) =>
								setDeckField(deckId, {
									rotation: [0, (e.detail.value ?? 0) * DEG2RAD, 0]
								})}
						/>
						<Checkbox
							label="face up"
							value={deck?.isFaceUp ?? false}
							on:change={(e) => setDeckField(deckId, { isFaceUp: !!e.detail.value })}
						/>
						{#if deck?.packOrigin}
							<Checkbox
								label="shuffle on load"
								value={deck?.shuffleOnLoad ?? false}
								on:change={(e) => setDeckField(deckId, { shuffleOnLoad: !!e.detail.value })}
							/>
						{/if}
					</TabPage>
				{/each}
			</TabGroup>
		</Folder>
	{/if}
	<HUDPieces
		ownerId={seatPlaceholderId(activeSeat)}
		beforeSpawn={() => ensureSeatPlaceholder(activeSeat)}
	/>
	<Folder title="Overlay (map)" expanded={false}>
		<Text label="Image URL" bind:value={imageUrl}></Text>
		<Point bind:value={point3d} label="Position" />
		<AutoValue label="Scale" bind:value={scale} />
		<Wheel label="Rotation" bind:value={rot} format={(v) => `${(Math.abs(v) % 360).toFixed(0)}°`} />
	</Folder>
	<Folder title="Save / Load" expanded={true}>
		<Text label="Name" bind:value={scenarioName} />
		<Button title="Save scenario" on:click={handleSave} />
		<List label="Saved" bind:value={selectedScenario} options={scenarioOptions} />
		<Button title="Load selected" on:click={handleLoad} />
		<Button title="Export selected (.json)" on:click={handleExport} />
		<Button title="Import scenario file" on:click={() => scenarioFileInput?.click()} />
		<Button title="Delete selected" on:click={handleDelete} />
		<Element>
			<input
				bind:this={scenarioFileInput}
				type="file"
				accept=".json,application/json"
				class="hidden"
				onchange={handleImportScenarioFile}
			/>
		</Element>
	</Folder>
	<Button title="Clear table" on:click={clearTable} />
	<Textarea
		disabled
		rows={4}
		value={`Everything here is local — no lobby is touched. Spawn or import a deck per seat, place the map, arrange, then Save. Pack decks save as a pack reference plus their card order, so a stacked deck reloads exactly; tick "shuffle on load" for a draw pile. Seed a lobby from /play → Settings → Scenarios. Note: cards in YOUR hand tray are not saved; keep starting cards on the table.`}
	/>
</Pane>
