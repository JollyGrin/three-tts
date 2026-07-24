import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  // svelte resolves to its server build by default, which cannot mount()
  // components — component tests need the browser build
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts']
    }
  }
});
