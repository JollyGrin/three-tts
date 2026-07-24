/**
 * Resolves face refs to renderable image URLs. See SPEC.md §4d.
 *
 * - `https://…`      → returned as-is
 * - `gen:std52/<code>` → drawn to a canvas once per client, cached as a data URL.
 * - `sheet:{json}`   → sprite-sheet cell, fetched + sliced async (reactive).
 *   Only the tiny ref string ever touches the store/wire — never image data —
 *   so every client resolves the same ref to the same deterministic image.
 */
import { writable, get } from 'svelte/store';
import { sliceCell } from '$lib/tts/slice';
import { namedCardImage } from './placeholder';
import { CARD_BACK_DEFAULT } from './standard52';

const CARD_W = 420;
const CARD_H = 600;

const RED = '#b3202e';
const BLACK = '#1c1c24';
const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

/**
 * Classic pip layouts per rank in unit space:
 * x ∈ {-1,0,1} maps to pip columns, y ∈ [-1,1] top→bottom.
 * Pips on the lower half are drawn rotated 180°, as on real cards.
 */
const PIP_LAYOUTS: Record<string, [number, number][]> = {
	'2': [
		[0, -1],
		[0, 1]
	],
	'3': [
		[0, -1],
		[0, 0],
		[0, 1]
	],
	'4': [
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1]
	],
	'5': [
		[-1, -1],
		[1, -1],
		[0, 0],
		[-1, 1],
		[1, 1]
	],
	'6': [
		[-1, -1],
		[1, -1],
		[-1, 0],
		[1, 0],
		[-1, 1],
		[1, 1]
	],
	'7': [
		[-1, -1],
		[1, -1],
		[0, -0.5],
		[-1, 0],
		[1, 0],
		[-1, 1],
		[1, 1]
	],
	'8': [
		[-1, -1],
		[1, -1],
		[0, -0.5],
		[-1, 0],
		[1, 0],
		[0, 0.5],
		[-1, 1],
		[1, 1]
	],
	'9': [
		[-1, -1],
		[1, -1],
		[-1, -1 / 3],
		[1, -1 / 3],
		[0, 0],
		[-1, 1 / 3],
		[1, 1 / 3],
		[-1, 1],
		[1, 1]
	],
	'10': [
		[-1, -1],
		[1, -1],
		[0, -2 / 3],
		[-1, -1 / 3],
		[1, -1 / 3],
		[-1, 1 / 3],
		[1, 1 / 3],
		[0, 2 / 3],
		[-1, 1],
		[1, 1]
	]
};

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
	if (typeof document === 'undefined') return null;
	const canvas = document.createElement('canvas');
	canvas.width = CARD_W;
	canvas.height = CARD_H;
	const ctx = canvas.getContext('2d');
	return ctx ? [canvas, ctx] : null;
}

function drawGlyph(
	ctx: CanvasRenderingContext2D,
	glyph: string,
	x: number,
	y: number,
	size: number,
	rotated = false
) {
	ctx.save();
	ctx.translate(x, y);
	if (rotated) ctx.rotate(Math.PI);
	ctx.font = `${size}px serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(glyph, 0, 0);
	ctx.restore();
}

function drawFace(rank: string, suit: string): string | null {
	const made = makeCanvas();
	if (!made) return null;
	const [canvas, ctx] = made;
	const glyph = SUIT_GLYPH[suit];
	const color = suit === 'H' || suit === 'D' ? RED : BLACK;

	ctx.fillStyle = '#fdfdf8';
	ctx.fillRect(0, 0, CARD_W, CARD_H);
	ctx.fillStyle = color;

	// corner indices (top-left, bottom-right rotated)
	for (const rotated of [false, true]) {
		ctx.save();
		if (rotated) {
			ctx.translate(CARD_W, CARD_H);
			ctx.rotate(Math.PI);
		}
		ctx.font = 'bold 58px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(rank, 44, 52);
		ctx.font = '48px serif';
		ctx.fillText(glyph, 44, 108);
		ctx.restore();
	}

	if (rank === 'A') {
		drawGlyph(ctx, glyph, CARD_W / 2, CARD_H / 2, 200);
	} else if (rank === 'J' || rank === 'Q' || rank === 'K') {
		ctx.font = `bold 170px Georgia, serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(rank, CARD_W / 2, CARD_H / 2 - 40);
		drawGlyph(ctx, glyph, CARD_W / 2, CARD_H / 2 + 110, 90);
	} else {
		const layout = PIP_LAYOUTS[rank] ?? [];
		for (const [ux, uy] of layout) {
			drawGlyph(ctx, glyph, CARD_W / 2 + ux * 85, CARD_H / 2 + uy * 170, 64, uy > 0);
		}
	}

	return canvas.toDataURL('image/png');
}

function drawBack(): string | null {
	const made = makeCanvas();
	if (!made) return null;
	const [canvas, ctx] = made;

	ctx.fillStyle = '#fdfdf8';
	ctx.fillRect(0, 0, CARD_W, CARD_H);
	ctx.fillStyle = '#28406b';
	ctx.fillRect(16, 16, CARD_W - 32, CARD_H - 32);

	// diagonal lattice
	ctx.strokeStyle = 'rgba(253, 253, 248, 0.35)';
	ctx.lineWidth = 3;
	ctx.save();
	ctx.beginPath();
	ctx.rect(16, 16, CARD_W - 32, CARD_H - 32);
	ctx.clip();
	for (let i = -CARD_H; i < CARD_W + CARD_H; i += 34) {
		ctx.moveTo(i, 0);
		ctx.lineTo(i + CARD_H, CARD_H);
		ctx.moveTo(i, CARD_H);
		ctx.lineTo(i + CARD_H, 0);
	}
	ctx.stroke();
	ctx.restore();

	return canvas.toDataURL('image/png');
}

const cache = new Map<string, string>();

function resolveGen(ref: string): string {
	const cached = cache.get(ref);
	if (cached) return cached;

	const code = ref.startsWith('gen:std52/') ? ref.slice('gen:std52/'.length) : null;
	let url: string | null = null;
	if (code === 'back') url = drawBack();
	else if (code) url = drawFace(code.slice(0, -1), code.slice(-1));

	if (!url) return ref; // SSR / no canvas: pass through harmlessly
	cache.set(ref, url);
	return url;
}

/**
 * `sheet:` refs resolve asynchronously (fetch + slice); results land in a
 * reactive map so any $derived that called resolveCardImage re-runs when
 * the slice completes. Game state carries only the tiny ref string —
 * data URLs never touch the store or the wire (SPEC §4d).
 */
type SheetRefPayload = {
	url: string;
	cols: number;
	rows: number;
	index: number;
	/** card name for the placeholder fallback when the sheet is dead */
	name?: string;
	/** back cells fall back to the generated card back, not a named proxy */
	back?: boolean;
};

const sheetPending = new Set<string>();

/**
 * Resolved sheet refs as a CLASSIC writable store. Components subscribe
 * with `$sheetRefCache` and pass the snapshot into resolveCardImage —
 * store subscription is Svelte's most battle-tested reactivity channel,
 * so a commit is guaranteed to re-render every subscriber.
 */
export const sheetRefCache = writable<Record<string, string>>({});

function commitSheetResult(ref: string, url: string) {
	sheetRefCache.update((m) => ({ ...m, [ref]: url }));
}

export function makeSheetRef(payload: SheetRefPayload): string {
	return `sheet:${JSON.stringify(payload)}`;
}

function parseSheetRef(ref: string): SheetRefPayload | null {
	try {
		return JSON.parse(ref.slice('sheet:'.length)) as SheetRefPayload;
	} catch (error) {
		console.warn('[resolve] unparseable sheet ref', ref.slice(0, 120), error);
		return null;
	}
}

async function sliceAndCommit(ref: string, payload: SheetRefPayload): Promise<string> {
	const fallback = () =>
		payload.back ? resolveGen(CARD_BACK_DEFAULT) : namedCardImage(payload.name ?? '');
	let url: string | null = null;
	try {
		url = await sliceCell(payload);
		if (url === null) console.warn('[resolve] sheet unreachable, using fallback:', payload.url);
	} catch (error) {
		console.warn('[resolve] slice failed, using fallback:', payload.url, error);
	}
	const result = url ?? fallback();
	commitSheetResult(ref, result);
	return result;
}

/**
 * Resolve a sheet ref ahead of rendering (used by the importer so local
 * imports paint synchronously on first render). Returns '' for dead art
 * only if even the fallback can't draw (no canvas).
 */
export async function prewarmSheetRef(ref: string): Promise<string> {
	const existing = get(sheetRefCache)[ref];
	if (existing !== undefined) return existing;
	const payload = parseSheetRef(ref);
	if (!payload) {
		commitSheetResult(ref, '');
		return '';
	}
	sheetPending.add(ref);
	return sliceAndCommit(ref, payload);
}

function resolveSheet(ref: string, cache?: Record<string, string>): string {
	const map = cache ?? get(sheetRefCache);
	const cached = map[ref];
	if (cached !== undefined) return cached;

	if (!sheetPending.has(ref)) {
		sheetPending.add(ref);
		const payload = parseSheetRef(ref);
		if (!payload) commitSheetResult(ref, '');
		else void sliceAndCommit(ref, payload);
	}
	return ''; // pending — the store commit re-renders subscribers when it lands
}

/** Resolve a face ref to something ImageMaterial can load. Unknown refs pass through. */
export function resolveCardImage(
	ref: string | undefined | null,
	sheetCache?: Record<string, string>
): string {
	if (!ref) return '';
	if (ref.startsWith('gen:')) return resolveGen(ref);
	if (ref.startsWith('sheet:')) return resolveSheet(ref, sheetCache);
	return ref;
}
