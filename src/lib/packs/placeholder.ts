/**
 * Named placeholder card faces for imports whose art URLs are dead
 * (link rot) or blocked. The deck stays playable as named proxies.
 */

const cache = new Map<string, string>();

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;
		if (ctx.measureText(candidate).width > maxWidth && line) {
			lines.push(line);
			line = word;
		} else {
			line = candidate;
		}
	}
	if (line) lines.push(line);
	return lines;
}

/** Draw a clean proxy card with the card's name. Cached per name. */
export function namedCardImage(name: string): string {
	const label = name || 'Unknown Card';
	const cached = cache.get(label);
	if (cached) return cached;
	if (typeof document === 'undefined') return '';

	const W = 420;
	const H = 600;
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d');
	if (!ctx) return '';

	ctx.fillStyle = '#f6f4ea';
	ctx.fillRect(0, 0, W, H);
	ctx.strokeStyle = '#3a3a44';
	ctx.lineWidth = 6;
	ctx.strokeRect(18, 18, W - 36, H - 36);

	ctx.fillStyle = '#26262e';
	ctx.font = 'bold 44px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	const lines = wrapText(ctx, label, W - 90);
	const lineHeight = 54;
	const startY = H / 2 - ((lines.length - 1) * lineHeight) / 2;
	lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lineHeight));

	ctx.font = '24px system-ui, sans-serif';
	ctx.fillStyle = '#8a8878';
	ctx.fillText('missing art', W / 2, H - 60);

	const url = canvas.toDataURL('image/png');
	cache.set(label, url);
	return url;
}
