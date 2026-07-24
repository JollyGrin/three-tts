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

export type ParsedPiece = {
	kind: 'token' | 'pawn' | 'counter';
	name: string;
	color?: string;
	imageUrl?: string;
	radius?: number;
	maxValue?: number;
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

function pieceFrom(obj: TtsObject): ParsedPiece | null {
	const type = obj.Name ?? '';
	const name = obj.Nickname || type;
	const position: [number, number] = [obj.Transform?.posX ?? 0, -(obj.Transform?.posZ ?? 0)];
	const color = colorToHex(obj.ColorDiffuse);
	const scale = obj.Transform?.scaleX ?? 1;

	if (type === 'Custom_Tile') {
		const imageUrl = obj.CustomImage?.ImageURL
			? normalizeAssetUrl(obj.CustomImage.ImageURL)
			: undefined;
		return { kind: 'token', name, color, imageUrl, radius: Math.max(0.4, scale), position };
	}
	if (type === 'PlayerPawn') {
		return { kind: 'pawn', name, color, radius: Math.max(0.3, scale * 0.3), position };
	}
	if (type === 'Custom_Model') {
		const maxValue = extractCounterMax(obj.LuaScript);
		if (maxValue !== null) {
			return { kind: 'counter', name, color, radius: 0.6, maxValue, position };
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
			const piece = pieceFrom(obj);
			if (piece) pieces.push(piece);
			else skipped.push(`${obj.Nickname || 'unnamed'} (${type})`);
		}
	}

	return { decks, looseCards, pieces, skipped };
}
