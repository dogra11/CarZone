/**
 * vite.config.js - Standard Vite + React configuration for development.
 *
 *   cd client && npm install && npm run dev   -> http://localhost:5173
 *
 * The dev server forwards every /api request to the Node backend on port 3000, so
 * the session cookie and the API work exactly as in production (same origin).
 * `npm run build` writes the production bundle to client/dist, which the Node
 * server serves at http://localhost:3000.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
    // The validation rules and constants are shared with the backend (../shared).
    fs: { allow: ['..'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
