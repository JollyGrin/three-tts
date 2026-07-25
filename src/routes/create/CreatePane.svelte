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
	import { tick } from 'svelte';
	import { get } from 'svelte/store';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { gameActions } from '$lib/store/game/actions';
	import { prewarmGameState } from '$lib/packs/prewarm-state';
	import {
		spawnPackDeck,
		spawnPackDeckSpread,
		spawnPackPiece,
		spawnPackOverlay
	} from '$lib/packs/spawn';
	import {
		spreadCardCount,
		spreadLayout,
		spreadRefusal,
		SPREAD_MAX_CARDS
	} from '$lib/packs/spread';
	import { onCardPick } from '$lib/store/cardPick';
	import { previewLayout, type PreviewLayout } from './preview-layout';
	import { CARD_BACK_DEFAULT } from '$lib/packs/standard52';
	import { parsePackFile, serializePackFile, packFileName } from '$lib/packs/file';
	import {
		listLibraryPacks,
		getLibraryPack,
		saveLibraryPack,
		deleteLibraryPack
	} from '$lib/packs/library';
	import FileDropZone from '$lib/files/FileDropZone.svelte';
	import { openDroppedFile } from '$lib/files/drop';
	import type { GamePackDef, PackPieceKind } from '$lib/packs/types';
	import { parseSavedObject } from '$lib/tts/parse';
	import { ttsToPack } from '$lib/tts/to-pack';
	import {
		COUNTER_MAX_DEFAULT,
		DIE_SIDES,
		DIE_SIDES_DEFAULT,
		PIECE_RADIUS
	} from '$lib/utils/constants-pieces';
	import type { DieSides } from '$lib/store/game/types';
	import {
		withEditorDefaults,
		cleanForExport,
		PIECE_COLOR_DEFAULT,
		type EditorPack
	} from './normalize';
	import FaceRef from './FaceRef.svelte';
	import BulkSheet from './BulkSheet.svelte';
	import { allocateCode } from './bulk-sheet';
	import type { PackCardDef } from '$lib/packs/types';
	import toast from 'svelte-french-toast';

	/** Everything the /create preview spawns is owned by this placeholder id */
	const PREVIEW_OWNER = 'preview';

	const HELP_TEXT =
		'A pack is a content library: decks (piles of cards), pieces, and board overlays. ' +
		'Everything here is local — no lobby is touched, and your pack library stays in ' +
		'this browser. The table previews the pack live as you edit. Save to the library ' +
		'and /setup and /play can spawn it straight onto a table; export writes a .tbpp.json ' +
		'validated against the format (docs/packs.md) to share it.';

	const TABLE_HELP_TEXT =
		'Preview table: "Deck" shows one pile per deck — drag a card off to look at ' +
		'it, then F (or "Flip cards on table") to turn it over. "Spread" (or L) lays ' +
		'every card out face-up and clicking one selects it here; that grid is ' +
		'DERIVED from the draft, so editing or adding a card never re-lays it out. ' +
		'Either way the table is inspection only: flips, taps (T / R), lifts (↑ / ↓) ' +
		'and anything you drag are neither saved into the pack nor kept — the next ' +
		'edit respawns the preview from the draft. C recentres the camera, hold Space ' +
		'for a close-up. The durable start face is the deck’s "Face up" box.';

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
	let stateCursor = $state(0);
	let overlayCursor = $state(0);

	const deckIndex = $derived(Math.min(deckCursor, Math.max(0, pack.decks.length - 1)));
	const deck = $derived(pack.decks[deckIndex]);
	const cardIndex = $derived(Math.min(cardCursor, Math.max(0, (deck?.cards.length ?? 0) - 1)));
	const card = $derived(deck?.cards[cardIndex]);
	const pieceIndex = $derived(Math.min(pieceCursor, Math.max(0, pack.pieces.length - 1)));
	const piece = $derived(pack.pieces[pieceIndex]);
	const stateIndex = $derived(Math.min(stateCursor, Math.max(0, (piece?.states.length ?? 0) - 1)));
	const pieceState = $derived(piece?.states[stateIndex]);
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
	const stateOptions = $derived(
		piece?.states.length
			? Object.fromEntries(piece.states.map((s, i) => [`${i}: ${s.name || `State ${i + 1}`}`, i]))
			: { '(no states)': 0 }
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

	/**
	 * Codes in play in the selected deck. `code` is the entity-id component
	 * (`card:<owner>:<slot>-<code>`), so a repeat collapses two cards into one
	 * table entity — every code minted below is allocated against this set.
	 */
	const takenCodes = $derived(deck?.cards.map((c) => c.code) ?? []);

	function addCard() {
		if (!deck) return toast.error('Add a deck first');
		// the deck's back, not an empty ref: an empty face resolves to '' and
		// renders nothing, so a brand new card would be invisible on the table
		// until someone found the face controls
		deck.cards.push({
			code: allocateCode(`card-${deck.cards.length}`, new Set(takenCodes)),
			name: '',
			face: deck.back || CARD_BACK_DEFAULT
		});
		cardCursor = deck.cards.length - 1;
	}

	function duplicateCard() {
		if (!deck || !card) return;
		// `AS` duplicated twice gives `AS-2` then `AS-3`, never two of either
		deck.cards.splice(cardIndex + 1, 0, {
			...card,
			code: allocateCode(card.code, new Set(takenCodes))
		});
		cardCursor = cardIndex + 1;
	}

	/** Append a bulk-sheet batch to the selected deck (codes already allocated). */
	function addBulkCards(cards: PackCardDef[]) {
		if (!deck) return toast.error('Add a deck first');
		deck.cards.push(...cards.map((c) => ({ ...c, name: c.name ?? '' })));
		cardCursor = deck.cards.length - 1;
		toast(`Added ${cards.length} card${cards.length === 1 ? '' : 's'} to ${deck.slot}`);
	}

	function removeCard() {
		if (!deck || !card) return;
		deck.cards.splice(cardIndex, 1);
		cardCursor = Math.max(0, cardIndex - 1);
	}

	const kindOptions: Record<string, PackPieceKind> = {
		Token: 'token',
		Pawn: 'pawn',
		Counter: 'counter',
		Dice: 'die'
	};

	const sidesOptions: Record<string, DieSides> = Object.fromEntries(
		DIE_SIDES.map((n) => [`d${n}`, n])
	);
	let newPieceKind: PackPieceKind = $state('token');

	function addPiece() {
		pack.pieces.push({
			kind: newPieceKind,
			name: newPieceKind,
			color: PIECE_COLOR_DEFAULT,
			imageUrl: '',
			radius: PIECE_RADIUS[newPieceKind],
			maxValue: COUNTER_MAX_DEFAULT,
			states: [],
			state: 0,
			sides: DIE_SIDES_DEFAULT,
			position: [0, 0]
		});
		pieceCursor = pack.pieces.length - 1;
	}

	function removePiece() {
		if (!piece) return;
		pack.pieces.splice(pieceIndex, 1);
		pieceCursor = Math.max(0, pieceIndex - 1);
	}

	/**
	 * Add a face to the selected piece. The first one is seeded from the piece's
	 * own image, because `states[0]` IS the base face (see PackPieceDef.states) —
	 * declaring states must never silently blank the piece.
	 */
	async function addPieceState() {
		if (!piece) return toast.error('Add a piece first');
		const previous = piece.states[piece.states.length - 1]?.face ?? piece.imageUrl;
		piece.states.push({ face: previous ?? '', name: `State ${piece.states.length + 1}` });
		const added = piece.states.length - 1;
		stateCursor = added;
		// the list rebuilds its options as the state lands, and tweakpane clamps
		// the bound index against the OLD option set while it does — without this
		// re-assert the cursor silently snaps back to state 1, and the face you
		// then type in overwrites the wrong state
		await tick();
		stateCursor = added;
	}

	function removePieceState() {
		if (!piece || !pieceState) return;
		piece.states.splice(stateIndex, 1);
		stateCursor = Math.max(0, stateIndex - 1);
		piece.state = Math.min(piece.state, Math.max(0, piece.states.length - 1));
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

	/**
	 * Flip whatever the preview spawned onto the table, so the flip gesture is
	 * reachable without hovering a card and knowing about `F`. Every card the
	 * editor puts on the table belongs to the preview owner, and the flip is
	 * inspection only — the next edit respawns the pack and it's gone.
	 */
	function flipTableCards() {
		const ids = Object.keys(get(gameStore)?.cards ?? {}).filter((id) =>
			id.includes(`:${PREVIEW_OWNER}:`)
		);
		if (!ids.length) return toast('Drag a card off a pile first');
		for (const id of ids) gameActions.flipCard(id);
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

	/**
	 * Preview card id → the cursors that select it, rebuilt by every spread
	 * respawn (and empty in Deck mode, where a card on the table was dragged
	 * off a pile rather than laid out from a known slot). Not $state: only the
	 * click handler reads it.
	 */
	let spreadCursors: Record<string, { deck: number; card: number }> = {};

	/**
	 * `selected` is the piece cursor and the state cursor: the selected piece
	 * previews on the state you are editing, so "preview each state" is just
	 * picking it in the list. Every other piece shows its base face.
	 */
	function respawnPreview(mode: PreviewLayout, selected: { piece: number; state: number }) {
		clearPreview();
		spreadCursors = {};
		const preview = exportable;

		// carpeting the felt with tiles too small to read is worse than a pile,
		// so past the cap the spread refuses and the CONTROL follows the table —
		// which also means the toast fires once, not on every keystroke after
		const refusal = mode === 'spread' ? spreadRefusal(preview.decks) : null;
		if (refusal) {
			previewLayout.set('deck');
			toast(
				refusal === 'too-many'
					? `${spreadCardCount(preview.decks)} cards is more than a spread shows ` +
							`(max ${SPREAD_MAX_CARDS}) — showing piles instead`
					: `${preview.decks.length} decks would spread off the table — showing piles instead`
			);
			mode = 'deck';
		}

		if (mode === 'spread') {
			// no empty-deck filter here: with no pile to render, an empty deck is
			// simply an empty block
			const layout = spreadLayout(preview.decks);
			preview.decks.forEach((deck, index) => {
				const ids = spawnPackDeckSpread(deck, {
					ownerId: PREVIEW_OWNER,
					tiles: layout[index]
				});
				ids.forEach((id, card) => (spreadCursors[id] = { deck: index, card }));
			});
		} else {
			// spawned per entity rather than through spawnPack: the preview must show
			// the deck in AUTHORED order (spawnPack shuffles facedown decks), and an
			// empty deck mid-authoring has no cards[0] for Deck.svelte to render
			preview.decks
				.filter((deck) => deck.cards.length > 0)
				.forEach((deck, index) =>
					spawnPackDeck(preview, deck, { ownerId: PREVIEW_OWNER, index, shuffle: false })
				);
		}

		preview.pieces?.forEach((_, index) =>
			spawnPackPiece(preview, index, {
				ownerId: PREVIEW_OWNER,
				state: index === selected.piece ? selected.state : 0
			})
		);
		preview.overlays?.forEach((_, index) => {
			spawnPackOverlay(preview, index, { ownerId: PREVIEW_OWNER });
			previewOverlayIds.push(`overlay:${preview.id}:${index}`);
		});
		void prewarmGameState(get(gameStore), () => gameStore.updateStateSilently({}));
	}

	$effect(() => {
		JSON.stringify(pack); // subscribe to every field of the draft
		const mode = $previewLayout;
		// read the cursors here too: selecting a piece's state must re-lay the
		// preview, which is how the table shows the state being edited
		const selected = { piece: pieceIndex, state: stateIndex };
		const timer = setTimeout(() => respawnPreview(mode, selected), 300);
		return () => clearTimeout(timer);
	});

	/**
	 * Click a laid-out card to select it — with the cards on the table, that's
	 * the obvious gesture, and it saves hunting the same card down in the Card
	 * list. Ignores ids no spread put there (a card dragged off a pile).
	 */
	$effect(() =>
		onCardPick((id) => {
			const cursors = spreadCursors[id];
			if (!cursors) return;
			deckCursor = cursors.deck;
			cardCursor = cursors.card;
		})
	);

	// ——— the pack library (localStorage packs:v1, shared with /setup and /play) ———
	let selectedPack = $state(listLibraryPacks()[0]?.pack.id ?? '');
	let libraryIds = $state(listLibraryPacks().map((entry) => entry.pack.id));
	const libraryOptions = $derived(
		libraryIds.length
			? Object.fromEntries(libraryIds.map((id) => [id, id]))
			: { '(none saved)': '' }
	);

	function refreshLibrary() {
		libraryIds = listLibraryPacks().map((entry) => entry.pack.id);
	}

	/**
	 * The draft as it last stood on disk. Anything else in the editor is unsaved
	 * work, and every action that REPLACES the draft asks first — losing an hour
	 * of authoring to a mis-click was the old behavior (#93).
	 */
	let savedSnapshot = $state(JSON.stringify(cleanForExport(emptyPack())));
	const isDirty = $derived(JSON.stringify(exportable) !== savedSnapshot);

	function markSaved(current = exportable) {
		savedSnapshot = JSON.stringify(current);
	}

	function confirmDiscard(what: string): boolean {
		if (!isDirty) return true;
		return window.confirm(`Discard your unsaved edits to "${pack.name}" and ${what}?`);
	}

	/** Put a pack in the editor: it becomes the draft, and it is now saved. */
	function editPack(next: GamePackDef) {
		pack = withEditorDefaults(next);
		markSaved(cleanForExport($state.snapshot(pack) as EditorPack));
	}

	function handleSavePack() {
		if (!pack.id.trim()) return toast.error('Give the pack an id first');
		saveLibraryPack(exportable);
		markSaved();
		refreshLibrary();
		selectedPack = pack.id;
		toast(`Saved to your pack library: ${pack.id}`);
	}

	function handleEditSelected() {
		const entry = getLibraryPack(selectedPack);
		if (!entry) return toast.error('Pick a saved pack first');
		if (!confirmDiscard(`edit "${entry.pack.name}"`)) return;
		editPack(entry.pack);
		toast(`Editing: ${entry.pack.id}`);
	}

	function handleDeleteSelected() {
		if (!selectedPack) return;
		deleteLibraryPack(selectedPack);
		refreshLibrary();
		selectedPack = libraryIds[0] ?? '';
	}

	// ——— open / export ———
	let ttsFileInput: HTMLInputElement | undefined = $state();
	let packFileInput: HTMLInputElement | undefined = $state();

	async function handleOpenTts(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const parsed = parseSavedObject(JSON.parse(await file.text()));
			const imported = ttsToPack(parsed);
			// converted, not authored: it is unsaved work until "Save to library"
			if (!confirmDiscard(`open "${file.name}"`)) return;
			pack = withEditorDefaults(imported);
			const skipped = parsed.skipped.length ? ` (skipped: ${parsed.skipped.join(', ')})` : '';
			toast(
				`Opened ${imported.decks.length} deck(s), ${imported.pieces?.length ?? 0} piece(s)${skipped}`,
				{ duration: 5000 }
			);
		} catch (error) {
			toast.error(
				`Could not open the file: ${error instanceof Error ? error.message : 'invalid file'}`
			);
		} finally {
			input.value = '';
		}
	}

	/**
	 * Opening a pack file both files it in the library and edits it — one
	 * gesture is enough for it to be spawnable at /setup and /play from then on.
	 *
	 * The library write is unconditional, the editor swap is not: refusing the
	 * discard prompt must not also throw away the file you just opened.
	 * Returns whether the editor took it.
	 */
	function openPack(imported: GamePackDef): boolean {
		saveLibraryPack(imported);
		refreshLibrary();
		selectedPack = imported.id;
		if (!confirmDiscard(`open "${imported.name}"`)) return false;
		editPack(imported);
		return true;
	}

	async function handleOpenPack(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const imported = parsePackFile(await file.text());
			toast(
				openPack(imported)
					? `Opened pack: ${imported.name} — saved to your pack library`
					: `Saved "${imported.name}" to your pack library — your draft is untouched`,
				{ duration: 5000 }
			);
		} catch (error) {
			toast.error(
				`Could not open the pack: ${error instanceof Error ? error.message : 'invalid file'}`
			);
		} finally {
			input.value = '';
		}
	}

	/**
	 * A file dropped on the editor's table. A pack opens for editing rather
	 * than spawning — the preview respawns from the draft on every edit, so
	 * anything else spawned here would vanish on the next keystroke. A scenario
	 * is saved for /setup and /play but not applied, for the same reason.
	 */
	async function handleDroppedFile(file: File) {
		await openDroppedFile(file, {
			onPack: (imported) => {
				// the library keeps it either way — only the editor swap is refusable
				if (!openPack(imported)) toast('Kept your draft; the pack is in your library');
			},
			onScenario: () => {}
		});
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

<!--
	Four panes, not one: each carries a single concern and remembers its own
	position and collapse state (`localStoreId`). Authoring a card — the thing
	this editor is for — is one pane deep, and Save / Export never hides under
	another section.
-->

<Pane
	position="draggable"
	title="Pack (local)"
	expanded={true}
	y={8}
	x={8}
	width={320}
	localStoreId="create-pane-pack"
>
	<Text label="Id" bind:value={pack.id} />
	<Text label="Name" bind:value={pack.name} />
	<List
		label="Scope"
		bind:value={pack.scope}
		options={{ 'player (one seat brings it)': 'player', 'table (the shared game)': 'table' }}
	/>
	<Textarea disabled rows={5} value={HELP_TEXT} />
</Pane>

<Pane
	position="draggable"
	title="Decks & Cards"
	expanded={true}
	y={190}
	x={8}
	width={320}
	localStoreId="create-pane-decks"
>
	<!-- first row, above the cursors: it decides what the whole table shows -->
	<List
		label="Layout"
		bind:value={$previewLayout}
		options={{ 'Deck — a pile per deck': 'deck', 'Spread — cards side by side (L)': 'spread' }}
	/>
	<List label="Deck" bind:value={deckCursor} options={deckOptions} />
	<Button title="Add deck" on:click={addDeck} />
	{#if deck}
		<Folder title="Deck ({deck.slot})" expanded={true}>
			<Text label="Slot" bind:value={deck.slot} />
			<Text label="Name" bind:value={deck.name} />
			<Checkbox label="Face up" bind:value={deck.isFaceUp} />
			<Button title="Remove deck" on:click={removeDeck} />
			<!-- keyed on the cursor: a fresh editor for whichever deck is selected -->
			{#key deckIndex}
				<FaceRef title="Deck back" value={deck.back} onchange={(ref) => (deck.back = ref)} />
			{/key}
		</Folder>

		<Folder title="Cards ({deck.cards.length})" expanded={true}>
			<List label="Card" bind:value={cardCursor} options={cardOptions} />
			<Button title="Add card" on:click={addCard} />
			{#if card}
				<Text label="Code" bind:value={card.code} />
				<Text label="Name" bind:value={card.name} />
				<Button title="Duplicate card" on:click={duplicateCard} />
				<Button title="Remove card" on:click={removeCard} />
				{#key `${deckIndex}:${cardIndex}`}
					<FaceRef title="Card face" value={card.face} onchange={(ref) => (card.face = ref)} />
				{/key}
			{/if}
		</Folder>
	{/if}

	<Button title="Flip cards on table (F)" on:click={flipTableCards} />
	<Textarea disabled rows={8} value={TABLE_HELP_TEXT} />
</Pane>

<Pane
	position="draggable"
	title="Board"
	expanded={true}
	y={8}
	x={344}
	width={320}
	localStoreId="create-pane-board"
>
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
			<!--
				States: the TTS `States` analog — one piece, several faces, cycled in
				play with X or picked from its right-click menu. State 1 is the BASE
				face (it replaces "Image URL" on export), so adding the first one
				copies the image rather than blanking the piece.
			-->
			<Folder title="States ({piece.states.length})" expanded={false}>
				<Button title="Add state" on:click={addPieceState} />
				{#if piece.states.length > 0}
					<List label="State" bind:value={stateCursor} options={stateOptions} />
				{/if}
				{#if pieceState}
					<Text label="State name" bind:value={pieceState.name} />
					<Checkbox
						label="Spawns on this state"
						value={piece.state === stateIndex}
						on:change={(e) => (piece.state = e.detail.value ? stateIndex : 0)}
					/>
					<Button title="Remove state" on:click={removePieceState} />
					<!-- keyed on the cursors: a fresh editor for whichever state is selected -->
					{#key `${pieceIndex}:${stateIndex}`}
						<FaceRef
							title="State face"
							value={pieceState.face}
							onchange={(ref) => (pieceState.face = ref)}
						/>
					{/key}
				{/if}
			</Folder>
			<AutoValue label="Radius" bind:value={piece.radius} />
			{#if piece.kind === 'counter'}
				<AutoValue label="Max value" bind:value={piece.maxValue} />
			{/if}
			{#if piece.kind === 'die'}
				<List label="Sides" bind:value={piece.sides} options={sidesOptions} />
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
</Pane>

<!--
	`localStoreId` bumped to -v2 with the restructure: tweakpane persists collapse
	state and position per id, so anyone who had once collapsed or dragged this
	pane would never see the controls added to it (#93 §6).
-->
<Pane
	position="draggable"
	title="Pack library / File"
	expanded={true}
	y={190}
	x={344}
	width={320}
	localStoreId="create-pane-file-v2"
>
	<Button title={isDirty ? 'Save to library •' : 'Save to library'} on:click={handleSavePack} />
	<List label="Saved" bind:value={selectedPack} options={libraryOptions} />
	<Button title="Edit selected" on:click={handleEditSelected} />
	<Button title="Delete selected" on:click={handleDeleteSelected} />
	<Button title="Export pack (.tbpp.json)" on:click={handleExport} />
	<!-- top-level, not inside a folder: opening a file someone sent you is a
	     starting move, and it was unfindable collapsed at the bottom (#93 §2) -->
	<Button title="Open a pack (.tbpp.json)" on:click={() => packFileInput?.click()} />
	<Folder title="Convert from another tool" expanded={false}>
		<Button title="Open a TTS deck (.json) → pack" on:click={() => ttsFileInput?.click()} />
	</Folder>
	<Element>
		<input
			bind:this={ttsFileInput}
			type="file"
			accept=".json,application/json"
			class="hidden"
			onchange={handleOpenTts}
		/>
		<input
			bind:this={packFileInput}
			type="file"
			accept=".json,application/json"
			class="hidden"
			onchange={handleOpenPack}
		/>
	</Element>
</Pane>

<FileDropZone onfile={handleDroppedFile} />

<!--
	A fifth pane rather than a folder under "Decks & Cards": the grid it shows
	is wider than a card's controls, and burying it would push Save / Export
	back under a section (#71 §4).
-->
<BulkSheet deckSlot={deck?.slot} takenCodes={[...takenCodes]} onadd={addBulkCards} />
