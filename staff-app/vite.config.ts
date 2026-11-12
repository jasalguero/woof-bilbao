import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Node's process, without pulling in @types/node for one line.
declare const process: { env: Record<string, string | undefined> };

// Tauri expects a fixed port and fails if it is not available.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    sveltekit({
      // A single-page app: Tauri serves static files, there is no server.
      adapter: adapter({ fallback: 'index.html' })
    })
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  preview: { port: 4173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
