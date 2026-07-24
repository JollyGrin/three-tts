/**
 * Load an image for use as a WebGL texture, falling back through the
 * CORS proxy when the host doesn't send CORS headers (display in an
 * <img> works without them; three.js texture upload does not).
 * Resolves to the URL that actually loaded plus natural dimensions.
 */

export const CORS_PROXY = 'https://corsproxy.innkeeper1.workers.dev/?url=';

export type LoadedImage = { url: string; width: number; height: number };

function tryLoad(url: string): Promise<LoadedImage | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
		img.onerror = () => resolve(null);
		img.src = url;
	});
}

const cache = new Map<string, Promise<LoadedImage | null>>();

export function loadTextureImage(url: string): Promise<LoadedImage | null> {
	if (!url) return Promise.resolve(null);
	const cached = cache.get(url);
	if (cached) return cached;
	const promise = tryLoad(url).then(
		(direct) => direct ?? tryLoad(CORS_PROXY + encodeURIComponent(url))
	);
	cache.set(url, promise);
	return promise;
}
