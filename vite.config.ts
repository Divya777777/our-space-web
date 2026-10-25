import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE: the folder the site is served from, e.g. /our-space-stg/ on GitHub Pages (default: the site root).
export default defineConfig({
  // eslint-disable-next-line no-undef
  base: (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VITE_BASE || '/',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 900 },
});
