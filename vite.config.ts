import path from 'node:path'
import { crx } from '@crxjs/vite-plugin'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'
import { manifestFor, type TargetBrowser } from './manifest.config'

// `vite --mode firefox` / `vite build --mode firefox` target Firefox; everything else targets Chrome.
export default defineConfig(({ mode }) => {
  const browser: TargetBrowser = mode === 'firefox' ? 'firefox' : 'chrome'
  const port = browser === 'firefox' ? 5174 : 5173

  return {
    test: {
      environment: 'node',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [svelte(), crx({ manifest: manifestFor(browser), browser })],
    server: {
      cors: {
        origin: [/chrome-extension:\/\//, /moz-extension:\/\//],
      },
      port,
      strictPort: true,
      hmr: {
        port,
      },
    },
    build: {
      outDir: browser === 'firefox' ? 'dist-firefox' : 'dist',
      rollupOptions: {
        // crxjs only picks up `side_panel` pages, not Firefox's `sidebar_action` panel.
        input: browser === 'firefox' ? { sidepanel: 'src/sidepanel/index.html' } : undefined,
        preserveEntrySignatures: 'exports-only',
      },
    },
  }
})
