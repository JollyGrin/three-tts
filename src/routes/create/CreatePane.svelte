<script lang="ts">
	import {
		AutoValue,
		Button,
		ButtonGrid,
		Checkbox,
		Color,
		Element,
		File as FileBlade,
		Folder,
		List,
		Pane,
		Point,
		Separator,
		Stepper,
		TabGroup,
		TabPage,
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
	import { CARD_BACK_DEFAULT, STANDARD_52 } from '$lib/packs/standard52';
	import { parsePackFile, serializePackFile, packFileName } from '$lib/packs/file';
	import {
		listLibraryPacks,
		getLibraryPack,
		saveLibraryPack,
		deleteLibraryPack
	} from '$lib/packs/library';
	import FileDropZone from '$lib/files/FileDropZone.svelte';
	import { openDroppedFile } from '$lib/files/drop';
	import type {
		GamePackDef,
		PackBagDrawMode,
		PackBagItemDef,
		PackPieceKind
	} from '$lib/packs/types';
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
		withBagItemDefaults,
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

	/** the editor column's width — the pane fills it exactly (see +page.svelte) */
	const PANE_WIDTH = 352;

	const HELP_TEXT =
		'A pack is a content library: decks (piles of cards), pieces (including bags — a ' +
		'hidden pool you draw from at the table), and board overlays. ' +
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

	/**
	 * A new pack: one empty deck, no cards. The deck is not fabricated content —
	 * a card has nowhere to go without one, and "Add card" would only toast "add
	 * a deck first". Everything else (the pack's name, its first card) is the
	 * author's to type; the old starter pack shipped an Ace of Spades nobody
	 * asked for, so the first gesture in the editor was deleting it (#108).
	 */
	function newPack(): EditorPack {
		return withEditorDefaults({
			id: 'my-pack',
			name: 'My Pack',
			scope: 'player',
			decks: [{ slot: 'main', name: 'Draw Pile', back: CARD_BACK_DEFAULT, cards: [] }]
		});
	}

	/**
	 * `null` until the author picks a starting point. There is no draft before
	 * that: the start state is the first screen, not 39 controls on a pack that
	 * fabricated itself.
	 */
	let pack = $state<EditorPack | null>(null);
	/** the draft as a plain (non-proxy) object, cleaned of editing defaults */
	const exportable = $derived(pack ? cleanForExport($state.snapshot(pack) as EditorPack) : null);

	// ——— cursors (indexes into the draft's arrays, clamped as arrays shrink) ———
	let deckCursor = $state(0);
	let cardCursor = $state(0);
	let pieceCursor = $state(0);
	let stateCursor = $state(0);
	let overlayCursor = $state(0);

	// the draft's collections, empty while there is no draft — every cursor and
	// option list below reads them rather than re-testing `pack` for null
	const decks = $derived(pack?.decks ?? []);
	const pieces = $derived(pack?.pieces ?? []);
	const overlays = $derived(pack?.overlays ?? []);

	const deckIndex = $derived(Math.min(deckCursor, Math.max(0, decks.length - 1)));
	const deck = $derived(decks[deckIndex]);
	const cardIndex = $derived(Math.min(cardCursor, Math.max(0, (deck?.cards.length ?? 0) - 1)));
	const card = $derived(deck?.cards[cardIndex]);
	const pieceIndex = $derived(Math.min(pieceCursor, Math.max(0, pieces.length - 1)));
	const piece = $derived(pieces[pieceIndex]);
	const stateIndex = $derived(Math.min(stateCursor, Math.max(0, (piece?.states.length ?? 0) - 1)));
	const pieceState = $derived(piece?.states[stateIndex]);
	let bagItemCursor = $state(0);
	const bagItemIndex = $derived(
		Math.min(bagItemCursor, Math.max(0, (piece?.contents.length ?? 0) - 1))
	);
	const bagItem = $derived(piece?.kind === 'bag' ? piece.contents[bagItemIndex] : undefined);
	const overlayIndex = $derived(Math.min(overlayCursor, Math.max(0, overlays.length - 1)));
	const overlay = $derived(overlays[overlayIndex]);

	const deckOptions = $derived(
		decks.length
			? Object.fromEntries(decks.map((d, i) => [`${i}: ${d.slot}`, i]))
			: { '(no decks)': 0 }
	);
	const cardOptions = $derived(
		deck?.cards.length
			? Object.fromEntries(deck.cards.map((c, i) => [`${i}: ${c.code}`, i]))
			: { '(no cards)': 0 }
	);
	const pieceOptions = $derived(
		pieces.length
			? Object.fromEntries(pieces.map((p, i) => [`${i}: ${p.kind} ${p.name}`, i]))
			: { '(no pieces)': 0 }
	);
	const overlayOptions = $derived(
		overlays.length
			? Object.fromEntries(overlays.map((_, i) => [`overlay ${i}`, i]))
			: { '(no overlays)': 0 }
	);
	const stateOptions = $derived(
		piece?.states.length
			? Object.fromEntries(piece.states.map((s, i) => [`${i}: ${s.name || `State ${i + 1}`}`, i]))
			: { '(no states)': 0 }
	);
	const bagItemOptions = $derived(
		piece?.contents.length
			? Object.fromEntries(
					piece.contents.map((item, i) => [
						`${i}: ${item.kind} ${item.kind === 'card' ? item.code : item.name}`,
						i
					])
				)
			: { '(empty bag)': 0 }
	);

	// ——— structure edits ———
	function addDeck() {
		if (!pack) return;
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
		if (!pack || !deck) return;
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
		Dice: 'die',
		Bag: 'bag'
	};

	const sidesOptions: Record<string, DieSides> = Object.fromEntries(
		DIE_SIDES.map((n) => [`d${n}`, n])
	);
	let newPieceKind: PackPieceKind = $state('token');

	const drawModeOptions: Record<string, PackBagDrawMode> = {
		'Random — blind draw': 'random',
		'LIFO — last in, first out': 'lifo',
		'FIFO — first in, first out': 'fifo'
	};

	const bagItemKindOptions: Record<string, PackBagItemDef['kind']> = {
		Token: 'token',
		Pawn: 'pawn',
		Counter: 'counter',
		Card: 'card'
	};
	let newBagItemKind: PackBagItemDef['kind'] = $state('token');

	function addPiece() {
		if (!pack) return;
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
			contents: [],
			drawMode: 'random',
			infinite: false,
			position: [0, 0]
		});
		pieceCursor = pack.pieces.length - 1;
	}

	function removePiece() {
		if (!pack || !piece) return;
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

	/**
	 * Codes in play in the selected bag. Same reason decks allocate codes: a
	 * drawn card's entity id is `card:<owner>:<bag>-<code>`, so a repeat would
	 * collapse two items into one card on the table.
	 */
	const takenBagCodes = $derived(
		(piece?.contents ?? []).filter((item) => item.kind === 'card').map((item) => item.code)
	);

	async function addBagItem() {
		if (!piece || piece.kind !== 'bag') return toast.error('Select a bag first');
		const base: PackBagItemDef =
			newBagItemKind === 'card'
				? {
						kind: 'card',
						code: allocateCode(`item-${piece.contents.length}`, new Set(takenBagCodes)),
						name: '',
						// the standard back, not '': an empty face ref renders nothing, so a
						// fresh item would draw as an invisible card
						face: CARD_BACK_DEFAULT
					}
				: { kind: newBagItemKind, name: newBagItemKind };
		piece.contents.push(withBagItemDefaults(base));
		const added = piece.contents.length - 1;
		bagItemCursor = added;
		// same clamp hazard as addPieceState above: the Item list rebuilds its
		// options as the item lands and tweakpane clamps the bound index against
		// the OLD set while it does, so the cursor has to be re-asserted or edits
		// go to the wrong item
		await tick();
		bagItemCursor = added;
	}

	function removeBagItem() {
		if (!piece || !bagItem) return;
		piece.contents.splice(bagItemIndex, 1);
		bagItemCursor = Math.max(0, bagItemIndex - 1);
	}

	function addOverlay() {
		if (!pack) return;
		pack.overlays.push({ imageUrl: '', ratio: 1, scale: 12 });
		overlayCursor = pack.overlays.length - 1;
	}

	function removeOverlay() {
		if (!pack || !overlay) return;
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
	 * Where Deck mode puts a pile. A pack does not author deck positions, so a
	 * spawned deck lands on its owner's own deck spot — the near-right corner of
	 * the felt, which the editor's shot (narrower than a full-width table, with
	 * the column beside it) cuts in half. The preview centres its piles instead,
	 * the same reasoning as the spread's fixed origin: what is being previewed
	 * has to be in the frame.
	 */
	function previewPilePosition(index: number, count: number): [number, number, number] {
		return [(index - (count - 1) / 2) * 3, 0.4, 0];
	}

	/**
	 * `selected` is the piece cursor and the state cursor: the selected piece
	 * previews on the state you are editing, so "preview each state" is just
	 * picking it in the list. Every other piece shows its base face.
	 */
	function respawnPreview(mode: PreviewLayout, selected: { piece: number; state: number }) {
		clearPreview();
		spreadCursors = {};
		const preview = exportable;
		if (!preview) return;

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
			const piles = preview.decks.filter((deck) => deck.cards.length > 0);
			piles.forEach((deck, index) =>
				spawnPackDeck(preview, deck, {
					ownerId: PREVIEW_OWNER,
					index,
					shuffle: false,
					position: previewPilePosition(index, piles.length)
				})
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
		// no draft, no preview: closing a pack leaves an empty table, not the
		// last thing that was on it
		if (!pack) return clearPreview();
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
	let savedSnapshot = $state('');
	const isDirty = $derived(!!exportable && JSON.stringify(exportable) !== savedSnapshot);

	function markSaved(current = exportable) {
		savedSnapshot = JSON.stringify(current);
	}

	function confirmDiscard(what: string): boolean {
		if (!isDirty) return true;
		return window.confirm(`Discard your unsaved edits to "${pack?.name}" and ${what}?`);
	}

	/** Put a pack in the editor: it becomes the draft, and it is now saved. */
	function editPack(next: GamePackDef) {
		pack = withEditorDefaults(next);
		// every cursor points into the OLD draft's arrays
		deckCursor = cardCursor = pieceCursor = stateCursor = overlayCursor = bagItemCursor = 0;
		markSaved(cleanForExport($state.snapshot(pack) as EditorPack));
	}

	// ——— the start state: the first screen, before there is anything to edit ———

	const START_BUTTONS = ['New empty pack', 'Standard 52 template'];

	function handleStart(label: string) {
		if (label === START_BUTTONS[1]) {
			// withEditorDefaults deep-copies decks and cards, so editing the draft
			// can't reach back into the built-in pack
			editPack(STANDARD_52);
			return toast(`Started from ${STANDARD_52.name}`);
		}
		editPack(newPack());
	}

	/** Back to the start state — the only way to reach it again after step 1. */
	function closePack() {
		if (!confirmDiscard('start over')) return;
		pack = null;
		savedSnapshot = '';
	}

	function handleSavePack() {
		if (!pack || !exportable) return;
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

	/**
	 * The one file entry point, behind the `File` blade's drop zone (start state
	 * and the File tab both mount one). A TTS save and a pack file are both
	 * `.json`, so the routing is by content — `ObjectStates` is TTS's root
	 * array — rather than by which button you found.
	 */
	async function handleOpenFile(picked: unknown) {
		// `unknown` in, cast here: the blade's own types name its value `File`,
		// which inside that module resolves to the component class rather than
		// the DOM type. What it hands over is a DOM File.
		const file = picked as globalThis.File | undefined;
		if (!file) return;
		let json: unknown;
		try {
			json = JSON.parse(await file.text());
		} catch {
			return toast.error(`${file.name} is not JSON`);
		}

		if (json && typeof json === 'object' && 'ObjectStates' in json) {
			try {
				const parsed = parseSavedObject(json);
				const imported = ttsToPack(parsed);
				// converted, not authored: it is unsaved work until "Save to library"
				if (!confirmDiscard(`open "${file.name}"`)) return;
				pack = withEditorDefaults(imported);
				markSaved(cleanForExport($state.snapshot(pack) as EditorPack));
				const skipped = parsed.skipped.length ? ` (skipped: ${parsed.skipped.join(', ')})` : '';
				toast(
					`Opened ${imported.decks.length} deck(s), ${imported.pieces?.length ?? 0} piece(s)${skipped}`,
					{ duration: 5000 }
				);
			} catch (error) {
				toast.error(
					`Could not open the TTS save: ${error instanceof Error ? error.message : 'invalid file'}`
				);
			}
			return;
		}

		try {
			const imported = parsePackFile(JSON.stringify(json));
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
		}
	}

	/**
	 * A file dropped on the editor's table. A pack opens for editing rather
	 * than spawning — the preview respawns from the draft on every edit, so
	 * anything else spawned here would vanish on the next keystroke. A scenario
	 * is saved for /setup and /play but not applied, for the same reason.
	 */
	async function handleDroppedFile(file: globalThis.File) {
		await openDroppedFile(file, {
			onPack: (imported) => {
				// the library keeps it either way — only the editor swap is refusable
				if (!openPack(imported)) toast('Kept your draft; the pack is in your library');
			},
			onScenario: () => {}
		});
	}

	function handleExport() {
		if (!exportable) return;
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

	/**
	 * The bulk sheet is a mode, not a fixture: it took prime screen space before
	 * anyone had a sheet URL, and its only tie to the selected deck was the text
	 * on its last button (#108). Opened from the Cards tab, next to the deck the
	 * batch lands in.
	 */
	let sheetOpen = $state(false);
</script>

<!--
	ONE pane, laid out `inline` so the editor column owns it: the four draggable
	panes this replaces had hard-coded positions but content-driven heights, so
	they overlapped each other and covered the felt the preview draws on (#108).
	Inline means overlap is structurally impossible and clipping becomes the
	column's scroll.

	Tabs, not folders: only one concern's controls are on screen at a time, and
	Save / Export stay one tab click away rather than buried under a section
	(#71 §4).
-->

{#if !pack}
	<!--
		Step 1. A separate pane rather than an {#if} inside the editor's blade
		tree: replacing one blade with another tears a tweakpane pane down, while
		mounting and unmounting a whole <Pane> is plain Svelte and safe.
	-->
	<Pane position="inline" title="new pack" userExpandable={false} width={PANE_WIDTH}>
		<Element>
			<div class="p-2 font-sans text-[11px] leading-snug text-white/60">
				A pack is a content library — decks, pieces and board overlays — authored here and kept in
				this browser. Start one, or open a file you were sent.
			</div>
		</Element>
		<ButtonGrid buttons={START_BUTTONS} on:click={(e) => handleStart(e.detail.label)} />
		<Separator />
		<!-- a real drop target, replacing the hidden <input type=file> + Button
		     hack: a pack file and a TTS save are both .json, and both land here -->
		<FileBlade
			label="Open"
			extensions={['.json']}
			rows={3}
			on:change={(e) => handleOpenFile(e.detail.value)}
		/>
		{#if libraryIds.length}
			<Separator />
			<List label="Continue" bind:value={selectedPack} options={libraryOptions} />
			<Button title="Open selected" on:click={handleEditSelected} />
		{/if}
	</Pane>
{:else}
	<Pane position="inline" title="pack editor" userExpandable={false} width={PANE_WIDTH}>
		<!--
			The breadcrumb row: what is selected, above the tabs, always mounted so
			#109 can fill it in with `pack › deck › card N of M` without touching the
			blade tree's shape.
		-->
		<Element>
			<div class="truncate p-1 font-sans text-[11px] text-white/70">
				{pack.name || pack.id}
			</div>
		</Element>

		<TabGroup>
			<TabPage title="Pack">
				<Text label="Id" bind:value={pack.id} />
				<Text label="Name" bind:value={pack.name} />
				<List
					label="Scope"
					bind:value={pack.scope}
					options={{ 'player (one seat brings it)': 'player', 'table (the shared game)': 'table' }}
				/>
				<Separator />
				<Button title="Close pack" on:click={closePack} />
				<!-- collapsed by default, and the home for the per-control help #115
				     rewrites: the editor should open on controls, not on prose -->
				<Folder title="How this works" expanded={false}>
					<Textarea disabled rows={7} value={HELP_TEXT} />
				</Folder>
			</TabPage>

			<TabPage title="Cards">
				<!-- first row, above the cursors: it decides what the whole table shows -->
				<List
					label="Layout"
					bind:value={$previewLayout}
					options={{
						'Deck — a pile per deck': 'deck',
						'Spread — cards side by side (L)': 'spread'
					}}
				/>
				<Separator />
				<!-- pick, then create/destroy, THEN the selected deck's fields: the
				     verbs used to sit between the selector and the fields they were
				     nothing to do with (#108) -->
				<List label="Deck" bind:value={deckCursor} options={deckOptions} />
				<ButtonGrid
					buttons={['Add deck', 'Remove deck']}
					on:click={(e) => (e.detail.index === 0 ? addDeck() : removeDeck())}
				/>
				{#if deck}
					<Text label="Slot" bind:value={deck.slot} />
					<Text label="Name" bind:value={deck.name} />
					<Checkbox label="Face up" bind:value={deck.isFaceUp} />
					<!-- keyed on the cursor: a fresh editor for whichever deck is selected -->
					{#key deckIndex}
						<FaceRef title="Deck back" value={deck.back} onchange={(ref) => (deck.back = ref)} />
					{/key}

					<Separator />
					<List label="Card" bind:value={cardCursor} options={cardOptions} />
					<ButtonGrid
						columns={3}
						buttons={['Add card', 'Duplicate card', 'Remove card']}
						on:click={(e) =>
							e.detail.index === 0
								? addCard()
								: e.detail.index === 1
									? duplicateCard()
									: removeCard()}
					/>
					{#if card}
						<Text label="Code" bind:value={card.code} />
						<Text label="Name" bind:value={card.name} />
						{#key `${deckIndex}:${cardIndex}`}
							<FaceRef title="Card face" value={card.face} onchange={(ref) => (card.face = ref)} />
						{/key}
					{/if}

					<Separator />
					<Button
						title={sheetOpen ? 'Close the sheet adder' : 'Add cards from a sheet…'}
						on:click={() => (sheetOpen = !sheetOpen)}
					/>
					{#if sheetOpen}
						<BulkSheet deckSlot={deck.slot} takenCodes={[...takenCodes]} onadd={addBulkCards} />
					{/if}
				{/if}

				<Separator />
				<Button title="Flip cards on table (F)" on:click={flipTableCards} />
				<Folder title="How this works" expanded={false}>
					<Textarea disabled rows={9} value={TABLE_HELP_TEXT} />
				</Folder>
			</TabPage>

			<TabPage title="Board">
				<!-- one line while the board is empty, so a pack of cards never has to
				     read past controls for things it does not have -->
				<Element>
					<div class="p-1 font-sans text-[11px] text-white/50">
						Pieces {pack.pieces.length} · Overlays {pack.overlays.length}{pack.pieces.length +
							pack.overlays.length ===
						0
							? ' — nothing on the board yet'
							: ''}
					</div>
				</Element>
				<Folder title="Pieces ({pack.pieces.length})" expanded={false}>
					<List label="New kind" bind:value={newPieceKind} options={kindOptions} />
					<Button title="Add {newPieceKind}" on:click={addPiece} />
					{#if piece}
						<Separator />
						<List label="Piece" bind:value={pieceCursor} options={pieceOptions} />
						<Text label="Name" bind:value={piece.name} />
						<Color label="Color" bind:value={piece.color} />
						{#if piece.kind === 'token' || piece.kind === 'bag'}
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
						{#if piece.kind === 'bag'}
							<List label="Draw order" bind:value={piece.drawMode} options={drawModeOptions} />
							<Checkbox label="Infinite" bind:value={piece.infinite} />
							<Folder title="Bag contents ({piece.contents.length})" expanded={true}>
								<List label="New item" bind:value={newBagItemKind} options={bagItemKindOptions} />
								<Button title="Add {newBagItemKind} to bag" on:click={addBagItem} />
								{#if bagItem}
									<List label="Item" bind:value={bagItemCursor} options={bagItemOptions} />
									<!-- one {#if} per field rather than a card/piece if-else pair: an
									     {#if} that REPLACES a tweakpane blade tears the whole pane
									     down (see BulkSheet.svelte), while adding and removing is safe -->
									{#if bagItem.kind === 'card'}
										<Text label="Code" bind:value={bagItem.code} />
									{/if}
									<Text label="Item name" bind:value={bagItem.name} />
									{#if bagItem.kind !== 'card'}
										<Color label="Item color" bind:value={bagItem.color} />
									{/if}
									{#if bagItem.kind !== 'card'}
										<Text label="Item image" bind:value={bagItem.imageUrl} />
									{/if}
									{#if bagItem.kind === 'counter'}
										<Stepper label="Item max" bind:value={bagItem.maxValue} step={1} />
									{/if}
									{#if bagItem.kind === 'card'}
										<!-- keyed on the cursor, like the deck's card face: a fresh
										     editor for whichever item is selected -->
										{#key `${pieceIndex}:${bagItemIndex}`}
											<FaceRef
												title="Item face"
												value={bagItem.face}
												onchange={(ref) => (bagItem.face = ref)}
											/>
										{/key}
									{/if}
									{#if bagItem.kind === 'card'}
										<Text label="Item back" bind:value={bagItem.back} />
									{/if}
									<Button title="Remove item" on:click={removeBagItem} />
								{/if}
							</Folder>
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
						<Separator />
						<List label="Overlay" bind:value={overlayCursor} options={overlayOptions} />
						<Text label="Image URL" bind:value={overlay.imageUrl} />
						<AutoValue label="Ratio (w/h)" bind:value={overlay.ratio} />
						<AutoValue label="Scale" bind:value={overlay.scale} />
						<Button title="Remove overlay" on:click={removeOverlay} />
					{/if}
				</Folder>
			</TabPage>

			<TabPage title="File">
				<!-- top of the tab, never inside a folder: one tab click from anywhere
				     in the editor to save or share what you have (#71 §4) -->
				<Button
					title={isDirty ? 'Save to library •' : 'Save to library'}
					on:click={handleSavePack}
				/>
				<Button title="Export pack (.tbpp.json)" on:click={handleExport} />
				<Separator />
				<FileBlade
					label="Open"
					extensions={['.json']}
					rows={3}
					on:change={(e) => handleOpenFile(e.detail.value)}
				/>
				<Separator />
				<List label="Saved" bind:value={selectedPack} options={libraryOptions} />
				<ButtonGrid
					buttons={['Edit selected', 'Delete selected']}
					on:click={(e) => (e.detail.index === 0 ? handleEditSelected() : handleDeleteSelected())}
				/>
			</TabPage>
		</TabGroup>
	</Pane>
{/if}

<FileDropZone onfile={handleDroppedFile} />
