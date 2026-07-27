import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		sveltekit(),
		tailwindcss(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'table.place',
				short_name: 'table.place',
				description: 'Board games in your browser. No installs, no accounts — a table is just a link.',
				theme_color: '#1d5c3a',
				background_color: '#123f27',
				icons: [
					{
						src: 'favicon.png',
						sizes: '192x192',
						type: 'image/png'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,glb,gltf}'],
				// the model catalog (~6MB of GLBs + thumbnails, tableplace-135) is
				// runtime-cached on demand by the models-cache rule below — precaching
				// it would push the whole kit into every PWA install/update payload
				globIgnores: ['**/models/**'],
				maximumFileSizeToCacheInBytes: 4194304, // 4MB - increased from default 2MB
				// Cache images and 3D models with a CacheFirst strategy
				runtimeCaching: [
					{
						urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'images-cache',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
							}
						}
					},
					{
						urlPattern: /\.(?:glb|gltf)$/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'models-cache',
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 60 * 24 * 60 * 60 // 60 days
							}
						}
					}
				]
			}
		})
	]
});
