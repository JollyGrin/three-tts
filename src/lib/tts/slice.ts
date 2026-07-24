/**
 * Sprite-sheet slicing for TTS imports: fetch a sheet image once,
 * cut cells into data URLs. Browser-only (canvas + Image).
 *
 * Failure modes are expected and non-fatal: dead URLs (link rot) and
 * hosts without CORS headers both resolve to `null`, and the importer
 * substitutes named placeholder faces.
 */

import type { SheetCell } from './parse';

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
	const cached = imageCache.get(url);
	if (cached) return cached;
	const promise = new Promise<HTMLImageElement | null>((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous'; // required to keep the canvas untainted
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = url;
	});
	imageCache.set(url, promise);
	return promise;
}

const cellCache = new Map<string, string>();

/**
 * Resolve a sheet cell to a data URL, or null if the sheet is
 * unreachable/CORS-blocked. Cells are cached per url+index.
 */
export async function sliceCell(cell: SheetCell): Promise<string | null> {
	const key = `${cell.url}#${cell.cols}x${cell.rows}@${cell.index}`;
	const cached = cellCache.get(key);
	if (cached) return cached;

	const img = await loadImage(cell.url);
	if (!img) return null;

	const cw = img.naturalWidth / cell.cols;
	const ch = img.naturalHeight / cell.rows;
	const sx = (cell.index % cell.cols) * cw;
	const sy = Math.floor(cell.index / cell.cols) * ch;

	const canvas = document.createElement('canvas');
	canvas.width = cw;
	canvas.height = ch;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);

	try {
		const url = canvas.toDataURL('image/jpeg', 0.85);
		cellCache.set(key, url);
		return url;
	} catch {
		return null; // tainted canvas (host without CORS) — caller falls back
	}
}
