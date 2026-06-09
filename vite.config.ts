import path from 'node:path'
import { crx } from '@crxjs/vite-plugin'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'
import manifest from './manifest.config'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [svelte(), crx({ manifest })],
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  build: {
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
    },
  },
})
