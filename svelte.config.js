import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		paths: {
			// Set the base path for GitHub Pages
			// base: '/tts'
			base: process.argv.includes('dev') ? '' : ''
		}
	}
};

export default config;
