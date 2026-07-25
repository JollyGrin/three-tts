/**
 * Minimal Tabletop Simulator "Saved Object" parser — pure functions, no DOM.
 * Handles deck-builder exports (e.g. the-unmatched.club): an ObjectStates
 * array containing decks, loose cards, and objects we don't support yet.
 * See SPEC.md §1 and TTS_IMPORT_PLAN.md for the full-save roadmap.
 */

export type TtsSheet = {
	FaceURL: string;
	BackURL: string;
	NumWidth: number;
	NumHeight: number;
	UniqueBack?: boolean;
	BackIsHidden?: boolean;
};

type TtsObject = {
	Name?: string;
	Nickname?: string;
	CardID?: number;
	DeckIDs?: number[];
	CustomDeck?: Record<string, TtsSheet>;
	ContainedObjects?: TtsObject[];
	/**
	 * Alternate states, keyed by 1-based state number — the object itself
	 * occupies the number missing from the sequence. See `statesOrder`.
	 */
	States?: Record<string, TtsObject>;
	Transform?: { posX?: number; posY?: number; posZ?: number; scaleX?: number };
	ColorDiffuse?: { r?: number; g?: number; b?: number };
	CustomImage?: { ImageURL?: string };
	LuaScript?: string;
};

export type SheetCell = { url: string; cols: number; rows: number; index: number };

export type ParsedCard = {
	name: string;
	face: SheetCell;
	/** whole image when cols/rows = 1, or a cell of a unique-back sheet */
	back: SheetCell;
};

export type ParsedDeck = { name: string; cards: ParsedCard[] };

/** One face of a multi-state piece, before face refs exist (see to-pack.ts). */
export type ParsedPieceState = {
	name: string;
	/** whole image (cols/rows = 1) or a sheet cell, exactly like a card face */
	face: SheetCell;
};

export type ParsedPiece = {
	kind: 'token' | 'pawn' | 'counter';
	name: string;
	color?: string;
	imageUrl?: string;
	radius?: number;
	maxValue?: number;
	/** every face of a TTS `States` object, in state order; absent when single-state */
	states?: ParsedPieceState[];
	/** index into `states` the object was saved showing */
	state?: number;
	position: [number, number];
};

export type ParsedSavedObject = {
	decks: ParsedDeck[];
	looseCards: ParsedCard[];
	pieces: ParsedPiece[];
	/** Nicknames/types of objects not yet importable */
	skipped: string[];
};

/** Rewrite dead Steam host + force https (see MULTIPLAYER research: old host is gone) */
export function normalizeAssetUrl(url: string): string {
	return url
		.replace(/^https?:\/\/cloud-3\.steamusercontent\.com\//, 'https://steamusercontent-a.akamaihd.net/')
		.replace(/^http:\/\//, 'https://');
}

/** CardID encoding: sheetKey * 100 + cellIndex */
export function decodeCardId(cardId: number): { sheetKey: string; index: number } {
	return { sheetKey: String(Math.floor(cardId / 100)), index: cardId % 100 };
}

function cardFromId(
	cardId: number,
	customDeck: Record<string, TtsSheet> | undefined,
	name: string
): ParsedCard | null {
	const { sheetKey, index } = decodeCardId(cardId);
	const sheet = customDeck?.[sheetKey];
	if (!sheet) return null;
	const face: SheetCell = {
		url: normalizeAssetUrl(sheet.FaceURL),
		cols: sheet.NumWidth,
		rows: sheet.NumHeight,
		index
	};
	const back: SheetCell = sheet.UniqueBack
		? { url: normalizeAssetUrl(sheet.BackURL), cols: sheet.NumWidth, rows: sheet.NumHeight, index }
		: { url: normalizeAssetUrl(sheet.BackURL), cols: 1, rows: 1, index: 0 };
	return { name, face, back };
}

function colorToHex(color?: { r?: number; g?: number; b?: number }): string | undefined {
	if (!color) return undefined;
	const channel = (v = 1) =>
		Math.round(Math.min(1, Math.max(0, v)) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/** TTS health dials carry a counter Lua script; the max value is the HP */
export function extractCounterMax(luaScript?: string): number | null {
	const match = luaScript?.match(/MAX_VALUE\s*=\s*(\d+)/);
	return match ? parseInt(match[1], 10) : null;
}

/**
 * Put a `States` dict in state order, with `null` marking the object's own
 * slot.
 *
 * TTS keeps the ACTIVE state as the object itself and stores only the others
 * in `States`, keyed by 1-based state number — so the current state is the one
 * number missing from the `1..N` sequence, where N is `keys.length + 1`. That
 * rule (not a `CurrentState` field, which does not exist in saves) is the whole
 * trick to reading states, so it is exported and tested directly.
 *
 * Sparse or out-of-range keys degrade rather than throw: the smallest missing
 * number wins the object's slot, and the remaining keys fill the rest in
 * ascending order.
 */
export function statesOrder(keys: string[]): { order: (string | null)[]; current: number } {
	const sorted = [...keys].sort((a, b) => Number(a) - Number(b));
	const total = sorted.length + 1;
	const present = new Set(sorted);
	let current = total;
	for (let i = 1; i <= total; i++) {
		if (!present.has(String(i))) {
			current = i;
			break;
		}
	}
	const order: (string | null)[] = [];
	let next = 0;
	for (let i = 1; i <= total; i++) order.push(i === current ? null : sorted[next++]);
	return { order, current: current - 1 };
}

/** The image a state shows, if its object class carries one at all. */
function stateFace(obj: TtsObject): SheetCell | null {
	const url = obj.CustomImage?.ImageURL;
	if (url) return { url: normalizeAssetUrl(url), cols: 1, rows: 1, index: 0 };
	// Card / CardCustom: the face is a cell of the deck's sprite sheet
	if (obj.CardID !== undefined) {
		return cardFromId(obj.CardID, obj.CustomDeck, obj.Nickname ?? '')?.face ?? null;
	}
	return null;
}

/**
 * Faces of a multi-state object, one level deep (states-of-states and
 * `ContainedObjects` inside a state are out of scope).
 *
 * Only image-bearing states become faces; a state of another object class
 * (a model, a script-only object) has nothing to render, so it degrades to a
 * `skipped` note and is left out — never fatal, and the current-state index is
 * computed against what survives. Fewer than two surviving faces means the
 * object is not really multi-state, and no states are emitted.
 */
function pieceStates(
	obj: TtsObject,
	skipped: string[]
): { states?: ParsedPieceState[]; state?: number } {
	const keys = Object.keys(obj.States ?? {});
	if (keys.length === 0) return {};

	const { order, current } = statesOrder(keys);
	const states: ParsedPieceState[] = [];
	let state = 0;
	order.forEach((key, i) => {
		const source = key === null ? obj : (obj.States?.[key] ?? {});
		const name = source.Nickname || source.Name || `State ${i + 1}`;
		const face = stateFace(source);
		if (!face) {
			skipped.push(`${name} (state ${i + 1} of ${obj.Nickname || 'unnamed'})`);
			return;
		}
		if (i === current) state = states.length;
		states.push({ name, face });
	});

	return states.length > 1 ? { states, state } : {};
}

function pieceFrom(obj: TtsObject, skipped: string[]): ParsedPiece | null {
	const type = obj.Name ?? '';
	const name = obj.Nickname || type;
	const position: [number, number] = [obj.Transform?.posX ?? 0, -(obj.Transform?.posZ ?? 0)];
	const color = colorToHex(obj.ColorDiffuse);
	const scale = obj.Transform?.scaleX ?? 1;

	if (type === 'Custom_Tile') {
		const imageUrl = obj.CustomImage?.ImageURL
			? normalizeAssetUrl(obj.CustomImage.ImageURL)
			: undefined;
		return {
			kind: 'token',
			name,
			color,
			imageUrl,
			radius: Math.max(0.4, scale),
			...pieceStates(obj, skipped),
			position
		};
	}
	if (type === 'PlayerPawn') {
		return {
			kind: 'pawn',
			name,
			color,
			radius: Math.max(0.3, scale * 0.3),
			...pieceStates(obj, skipped),
			position
		};
	}
	if (type === 'Custom_Model') {
		const maxValue = extractCounterMax(obj.LuaScript);
		if (maxValue !== null) {
			return {
				kind: 'counter',
				name,
				color,
				radius: 0.6,
				maxValue,
				...pieceStates(obj, skipped),
				position
			};
		}
	}
	return null;
}

export function parseSavedObject(json: unknown): ParsedSavedObject {
	const root = json as { ObjectStates?: TtsObject[] };
	const objects = Array.isArray(root?.ObjectStates) ? root.ObjectStates : [];
	const decks: ParsedDeck[] = [];
	const looseCards: ParsedCard[] = [];
	const pieces: ParsedPiece[] = [];
	const skipped: string[] = [];

	for (const obj of objects) {
		const type = obj.Name ?? 'Unknown';
		if (type === 'Deck' || type === 'DeckCustom') {
			const ids = obj.DeckIDs ?? [];
			const contained = obj.ContainedObjects ?? [];
			const cards = ids
				.map((id, i) => cardFromId(id, obj.CustomDeck, contained[i]?.Nickname ?? ''))
				.filter((c): c is ParsedCard => c !== null);
			decks.push({ name: obj.Nickname || `Deck ${decks.length + 1}`, cards });
		} else if ((type === 'Card' || type === 'CardCustom') && obj.CardID !== undefined) {
			const card = cardFromId(obj.CardID, obj.CustomDeck, obj.Nickname ?? '');
			if (card) looseCards.push(card);
		} else {
			const piece = pieceFrom(obj, skipped);
			if (piece) pieces.push(piece);
			else skipped.push(`${obj.Nickname || 'unnamed'} (${type})`);
		}
	}

	return { decks, looseCards, pieces, skipped };
}
