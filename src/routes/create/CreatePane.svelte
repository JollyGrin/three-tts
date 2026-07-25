<script lang="ts">
	import {
		AutoValue,
		Button,
		Checkbox,
		Color,
		Element,
		Folder,
		List,
		Pane,
		Point,
		Text,
		Textarea
	} from 'svelte-tweakpane-ui';
	import { get } from 'svelte/store';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { makeSheetRef } from '$lib/packs/resolve.svelte';
	import { prewarmGameState } from '$lib/packs/prewarm-state';
	import { spawnPackDeck, spawnPackPiece, spawnPackOverlay } from '$lib/packs/spawn';
	import { CARD_BACK_DEFAULT } from '$lib/packs/standard52';
	import { parsePackFile, serializePackFile, packFileName } from '$lib/packs/file';
	import { listPackDrafts, getPackDraft, savePackDraft, deletePackDraft } from '$lib/packs/drafts';
	import type { PackPieceKind } from '$lib/packs/types';
	import { parseSavedObject } from '$lib/tts/parse';
	import { ttsToPack } from '$lib/tts/to-pack';
	import { COUNTER_MAX_DEFAULT, PIECE_RADIUS } from '$lib/utils/constants-pieces';
	import {
		withEditorDefaults,
		cleanForExport,
		PIECE_COLOR_DEFAULT,
		type EditorPack
	} from './normalize';
	import toast from 'svelte-french-toast';

	/** Everything the /create preview spawns is owned by this placeholder id */
	const PREVIEW_OWNER = 'preview';

	const HELP_TEXT =
		'A pack is a content library: decks (piles of cards), pieces, and board overlays. ' +
		'Everything here is local — no lobby is touched, and drafts stay in this browser. ' +
		'The table previews the pack live as you edit. Export validates against the tbpp ' +
		'format (docs/packs.md), then /setup spawns the file onto a seat.';

	function emptyPack(): EditorPack {
		return withEditorDefaults({
			id: 'my-pack',
			name: 'My Pack',
			scope: 'player',
			decks: [
				{
					slot: 'main',
					name: 'Draw Pile',
					back: CARD_BACK_DEFAULT,
					cards: [{ code: 'AS', name: 'Ace of Spades', face: 'gen:std52/AS' }]
				}
			]
		});
	}

	let pack: EditorPack = $state(emptyPack());
	/** the draft as a plain (non-proxy) object, cleaned of editing defaults */
	const exportable = $derived(cleanForExport($state.snapshot(pack) as EditorPack));

	// ——— cursors (indexes into the draft's arrays, clamped as arrays shrink) ———
	let deckCursor = $state(0);
	let cardCursor = $state(0);
	let pieceCursor = $state(0);
	let overlayCursor = $state(0);

	const deckIndex = $derived(Math.min(deckCursor, Math.max(0, pack.decks.length - 1)));
	const deck = $derived(pack.decks[deckIndex]);
	const cardIndex = $derived(Math.min(cardCursor, Math.max(0, (deck?.cards.length ?? 0) - 1)));
	const card = $derived(deck?.cards[cardIndex]);
	const pieceIndex = $derived(Math.min(pieceCursor, Math.max(0, pack.pieces.length - 1)));
	const piece = $derived(pack.pieces[pieceIndex]);
	const overlayIndex = $derived(Math.min(overlayCursor, Math.max(0, pack.overlays.length - 1)));
	const overlay = $derived(pack.overlays[overlayIndex]);

	const deckOptions = $derived(
		pack.decks.length
			? Object.fromEntries(pack.decks.map((d, i) => [`${i}: ${d.slot}`, i]))
			: { '(no decks)': 0 }
	);
	const cardOptions = $derived(
		deck?.cards.length
			? Object.fromEntries(deck.cards.map((c, i) => [`${i}: ${c.code}`, i]))
			: { '(no cards)': 0 }
	);
	const pieceOptions = $derived(
		pack.pieces.length
			? Object.fromEntries(pack.pieces.map((p, i) => [`${i}: ${p.kind} ${p.name}`, i]))
			: { '(no pieces)': 0 }
	);
	const overlayOptions = $derived(
		pack.overlays.length
			? Object.fromEntries(pack.overlays.map((_, i) => [`overlay ${i}`, i]))
			: { '(no overlays)': 0 }
	);

	// ——— structure edits ———
	function addDeck() {
		pack.decks.push({
			slot: `deck-${pack.decks.length}`,
			name: `Deck ${pack.decks.length + 1}`,
			back: CARD_BACK_DEFAULT,
			isFaceUp: false,
			cards: []
		});
		deckCursor = pack.decks.length - 1;
	}

	function removeDeck() {
		if (!deck) return;
		pack.decks.splice(deckIndex, 1);
		deckCursor = Math.max(0, deckIndex - 1);
	}

	function addCard() {
		if (!deck) return toast.error('Add a deck first');
		deck.cards.push({ code: `card-${deck.cards.length}`, name: '', face: '' });
		cardCursor = deck.cards.length - 1;
	}

	function duplicateCard() {
		if (!deck || !card) return;
		deck.cards.splice(cardIndex + 1, 0, { ...card, code: `${card.code}-copy` });
		cardCursor = cardIndex + 1;
	}

	function removeCard() {
		if (!deck || !card) return;
		deck.cards.splice(cardIndex, 1);
		cardCursor = Math.max(0, cardIndex - 1);
	}

	const kindOptions: Record<string, PackPieceKind> = {
		Token: 'token',
		Pawn: 'pawn',
		Counter: 'counter'
	};
	let newPieceKind: PackPieceKind = $state('token');

	function addPiece() {
		pack.pieces.push({
			kind: newPieceKind,
			name: newPieceKind,
			color: PIECE_COLOR_DEFAULT,
			imageUrl: '',
			radius: PIECE_RADIUS[newPieceKind],
			maxValue: COUNTER_MAX_DEFAULT,
			position: [0, 0]
		});
		pieceCursor = pack.pieces.length - 1;
	}

	function removePiece() {
		if (!piece) return;
		pack.pieces.splice(pieceIndex, 1);
		pieceCursor = Math.max(0, pieceIndex - 1);
	}

	function addOverlay() {
		pack.overlays.push({ imageUrl: '', ratio: 1, scale: 12 });
		overlayCursor = pack.overlays.length - 1;
	}

	function removeOverlay() {
		if (!overlay) return;
		pack.overlays.splice(overlayIndex, 1);
		overlayCursor = Math.max(0, overlayIndex - 1);
	}

	// ——— face-ref builder: raw url / gen:std52 / sheet:{…} ———
	type FaceScheme = 'url' | 'gen' | 'sheet';
	const schemeOptions: Record<string, FaceScheme> = {
		'Image URL (https:)': 'url',
		'Generated (gen:std52)': 'gen',
		'Sprite sheet (sheet:)': 'sheet'
	};
	let faceScheme: FaceScheme = $state('url');
	let faceUrl = $state('');
	let genCode = $state('AS');
	let sheetUrl = $state('');
	let sheetCols = $state(10);
	let sheetRows = $state(7);
	let sheetIndex = $state(0);

	const builtFaceRef = $derived.by(() => {
		if (faceScheme === 'url') return faceUrl.trim();
		if (faceScheme === 'gen') return `gen:std52/${genCode.trim()}`;
		if (!sheetUrl.trim()) return '';
		return makeSheetRef({
			url: sheetUrl.trim(),
			cols: Math.max(1, Math.round(sheetCols)),
			rows: Math.max(1, Math.round(sheetRows)),
			index: Math.max(0, Math.round(sheetIndex))
		});
	});

	function applyFaceToCard() {
		if (!card) return toast.error('Select a card first');
		if (!builtFaceRef) return toast.error('Face ref is empty');
		card.face = builtFaceRef;
	}

	function applyFaceToBack() {
		if (!deck) return toast.error('Select a deck first');
		if (!builtFaceRef) return toast.error('Face ref is empty');
		deck.back = builtFaceRef;
	}

	// ——— live preview: respawn the pack under the preview owner on every edit ———

	/**
	 * Overlays are keyed by pack id, not by owner (claimSeat never renames
	 * them), so the owner match below can't find them — the ids spawned by the
	 * last preview are remembered instead. Not $state: only clearPreview reads it.
	 */
	let previewOverlayIds: string[] = [];

	function clearPreview() {
		const s = get(gameStore);
		const update: Record<string, Record<string, null>> = {
			cards: {},
			decks: {},
			pieces: {},
			overlays: {}
		};
		for (const collection of ['cards', 'decks', 'pieces'] as const) {
			for (const key of Object.keys(s?.[collection] ?? {})) {
				if (key.includes(`:${PREVIEW_OWNER}:`)) update[collection][key] = null;
			}
		}
		for (const id of previewOverlayIds) update.overlays[id] = null;
		previewOverlayIds = [];
		gameStore.updateState(update as Parameters<typeof gameStore.updateState>[0]);
	}

	function respawnPreview() {
		clearPreview();
		const preview = exportable;
		// spawned per entity rather than through spawnPack: the preview must show
		// the deck in AUTHORED order (spawnPack shuffles facedown decks), and an
		// empty deck mid-authoring has no cards[0] for Deck.svelte to render
		preview.decks
			.filter((deck) => deck.cards.length > 0)
			.forEach((deck, index) =>
				spawnPackDeck(preview, deck, { ownerId: PREVIEW_OWNER, index, shuffle: false })
			);
		preview.pieces?.forEach((_, index) =>
			spawnPackPiece(preview, index, { ownerId: PREVIEW_OWNER })
		);
		preview.overlays?.forEach((_, index) => {
			spawnPackOverlay(preview, index, { ownerId: PREVIEW_OWNER });
			previewOverlayIds.push(`overlay:${preview.id}:${index}`);
		});
		void prewarmGameState(get(gameStore), () => gameStore.updateStateSilently({}));
	}

	$effect(() => {
		JSON.stringify(pack); // subscribe to every field of the draft
		const timer = setTimeout(respawnPreview, 300);
		return () => clearTimeout(timer);
	});

	// ——— drafts (localStorage packs:v1) ———
	let selectedDraft = $state(listPackDrafts()[0]?.pack.id ?? '');
	let draftIds = $state(listPackDrafts().map((d) => d.pack.id));
	const draftOptions = $derived(
		draftIds.length ? Object.fromEntries(draftIds.map((id) => [id, id])) : { '(none saved)': '' }
	);

	function refreshDrafts() {
		draftIds = listPackDrafts().map((d) => d.pack.id);
	}

	function handleSaveDraft() {
		if (!pack.id.trim()) return toast.error('Give the pack an id first');
		savePackDraft(exportable);
		refreshDrafts();
		selectedDraft = pack.id;
		toast(`Saved draft: ${pack.id}`);
	}

	function handleLoadDraft() {
		const draft = getPackDraft(selectedDraft);
		if (!draft) return toast.error('Pick a saved draft first');
		pack = withEditorDefaults(draft.pack);
		toast(`Loaded: ${draft.pack.id}`);
	}

	function handleDeleteDraft() {
		if (!selectedDraft) return;
		deletePackDraft(selectedDraft);
		refreshDrafts();
		selectedDraft = draftIds[0] ?? '';
	}

	// ——— import / export ———
	let ttsFileInput: HTMLInputElement | undefined = $state();
	let packFileInput: HTMLInputElement | undefined = $state();

	async function handleImportTts(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const parsed = parseSavedObject(JSON.parse(await file.text()));
			const imported = ttsToPack(parsed);
			pack = withEditorDefaults(imported);
			const skipped = parsed.skipped.length ? ` (skipped: ${parsed.skipped.join(', ')})` : '';
			toast(
				`Imported ${imported.decks.length} deck(s), ${imported.pieces?.length ?? 0} piece(s)${skipped}`,
				{ duration: 5000 }
			);
		} catch (error) {
			toast.error(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`);
		} finally {
			input.value = '';
		}
	}

	async function handleImportPack(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const imported = parsePackFile(await file.text());
			pack = withEditorDefaults(imported);
			toast(`Loaded pack: ${imported.name}`);
		} catch (error) {
			toast.error(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`);
		} finally {
			input.value = '';
		}
	}

	function handleExport() {
		try {
			const text = serializePackFile(exportable);
			// validate before download with the same parser importers use, so a
			// broken pack surfaces here rather than on someone else's table
			parsePackFile(text);
			const blob = new Blob([text], { type: 'application/json' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = packFileName(exportable);
			a.click();
			URL.revokeObjectURL(a.href);
			toast(`Exported ${packFileName(exportable)}`);
		} catch (error) {
			toast.error(`Export failed: ${error instanceof Error ? error.message : 'invalid pack'}`);
		}
	}
</script>

<Pane
	position="draggable"
	title="Pack Editor (local)"
	expanded={true}
	y={0}
	x={0}
	width={340}
	localStoreId="create-pane"
>
	<Folder title="Pack" expanded={true}>
		<Text label="Id" bind:value={pack.id} />
		<Text label="Name" bind:value={pack.name} />
		<List
			label="Scope"
			bind:value={pack.scope}
			options={{ 'player (one seat brings it)': 'player', 'table (the shared game)': 'table' }}
		/>
	</Folder>

	<Folder title="Decks ({pack.decks.length})" expanded={true}>
		<List label="Deck" bind:value={deckCursor} options={deckOptions} />
		<Button title="Add deck" on:click={addDeck} />
		{#if deck}
			<Text label="Slot" bind:value={deck.slot} />
			<Text label="Name" bind:value={deck.name} />
			<Text label="Back ref" bind:value={deck.back} />
			<Checkbox label="Face up" bind:value={deck.isFaceUp} />
			<Button title="Remove deck" on:click={removeDeck} />
			<Folder title="Cards ({deck.cards.length})" expanded={true}>
				<List label="Card" bind:value={cardCursor} options={cardOptions} />
				<Button title="Add card" on:click={addCard} />
				{#if card}
					<Text label="Code" bind:value={card.code} />
					<Text label="Name" bind:value={card.name} />
					<Text label="Face ref" bind:value={card.face} />
					<Button title="Duplicate card" on:click={duplicateCard} />
					<Button title="Remove card" on:click={removeCard} />
				{/if}
			</Folder>
		{/if}
	</Folder>

	<Folder title="Face ref builder" expanded={false}>
		<List label="Scheme" bind:value={faceScheme} options={schemeOptions} />
		{#if faceScheme === 'url'}
			<Text label="Image URL" bind:value={faceUrl} />
		{:else if faceScheme === 'gen'}
			<Text label="Code (AS…KC, back)" bind:value={genCode} />
		{:else}
			<Text label="Sheet URL" bind:value={sheetUrl} />
			<AutoValue label="Columns" bind:value={sheetCols} />
			<AutoValue label="Rows" bind:value={sheetRows} />
			<AutoValue label="Cell index" bind:value={sheetIndex} />
		{/if}
		<Text label="Result" value={builtFaceRef} disabled />
		<Button title="Set as card face" on:click={applyFaceToCard} />
		<Button title="Set as deck back" on:click={applyFaceToBack} />
	</Folder>

	<Folder title="Pieces ({pack.pieces.length})" expanded={false}>
		<List label="New kind" bind:value={newPieceKind} options={kindOptions} />
		<Button title="Add {newPieceKind}" on:click={addPiece} />
		{#if piece}
			<List label="Piece" bind:value={pieceCursor} options={pieceOptions} />
			<Text label="Name" bind:value={piece.name} />
			<Color label="Color" bind:value={piece.color} />
			{#if piece.kind === 'token'}
				<Text label="Image URL" bind:value={piece.imageUrl} />
			{/if}
			<AutoValue label="Radius" bind:value={piece.radius} />
			{#if piece.kind === 'counter'}
				<AutoValue label="Max value" bind:value={piece.maxValue} />
			{/if}
			<Point
				label="Position"
				value={{ x: piece.position[0], y: piece.position[1] }}
				on:change={(e) => {
					//@ts-expect-error: does exist
					const x = e.detail.value?.x ?? piece.position[0];
					//@ts-expect-error: does exist
					const z = e.detail.value?.y ?? piece.position[1];
					piece.position = [x, z];
				}}
			/>
			<Button title="Remove piece" on:click={removePiece} />
		{/if}
	</Folder>

	<Folder title="Overlays — boards/maps ({pack.overlays.length})" expanded={false}>
		<Button title="Add overlay" on:click={addOverlay} />
		{#if overlay}
			<List label="Overlay" bind:value={overlayCursor} options={overlayOptions} />
			<Text label="Image URL" bind:value={overlay.imageUrl} />
			<AutoValue label="Ratio (w/h)" bind:value={overlay.ratio} />
			<AutoValue label="Scale" bind:value={overlay.scale} />
			<Button title="Remove overlay" on:click={removeOverlay} />
		{/if}
	</Folder>

	<Folder title="Start from an existing file" expanded={false}>
		<Button title="Import TTS json → pack" on:click={() => ttsFileInput?.click()} />
		<Button title="Open a pack (.tbpp.json)" on:click={() => packFileInput?.click()} />
		<Element>
			<input
				bind:this={ttsFileInput}
				type="file"
				accept=".json,application/json"
				class="hidden"
				onchange={handleImportTts}
			/>
			<input
				bind:this={packFileInput}
				type="file"
				accept=".json,application/json"
				class="hidden"
				onchange={handleImportPack}
			/>
		</Element>
	</Folder>

	<Folder title="Drafts / Export" expanded={true}>
		<Button title="Save draft" on:click={handleSaveDraft} />
		<List label="Saved" bind:value={selectedDraft} options={draftOptions} />
		<Button title="Load selected" on:click={handleLoadDraft} />
		<Button title="Delete selected" on:click={handleDeleteDraft} />
		<Button title="Export pack (.tbpp.json)" on:click={handleExport} />
	</Folder>

	<Textarea disabled rows={5} value={HELP_TEXT} />
</Pane>
