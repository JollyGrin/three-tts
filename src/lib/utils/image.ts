/**
 * On Github pages, the URL is https://jollygrin.github.io/three-tts/
 * So to fetch resources from /static on production, need to append it
 *
 * @example: getStaticResourceUrl('/image.png')
 * => https://jollygrin.github.io/three-tts/image.png
 * => http://localhost:5173/image.png
 *
 * */
export function getStaticResourceUrl(path: string) {
	const basePath = import.meta.env.MODE === 'production' ? '/three-tts' : '';
	const resourceUrl = basePath + path;
	return resourceUrl;
}
