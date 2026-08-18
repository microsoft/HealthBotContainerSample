import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite build for the React Web Chat client.
//
// - Dev (`npm run dev`): serves the app on :3000 and proxies the token/health
//   endpoints to the Express backend (`server.js`, :8080) so the same JWT flow
//   used in production works locally without CORS glue.
// - Prod (`npm run build`): emits a static bundle to `dist/`, which Express serves.
//
// `global: 'globalThis'` shims the Node-style `global` reference that some
// Bot Framework Web Chat transitive dependencies expect when run in the browser.
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['botframework-webchat'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Do not emit production source maps: server.js serves `dist/` statically, so
    // published `.map` files would expose the original source. Flip to 'hidden' if
    // you upload maps to an error-monitoring service out-of-band.
    sourcemap: false,
  },
  server: {
    port: 3000,
    proxy: {
      '/chatBot': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
});
