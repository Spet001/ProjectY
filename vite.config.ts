import { defineConfig } from 'vite';
import path from 'path';
import { artProxyPlugin } from './tools/art-proxy-plugin.js';

export default defineConfig({
  plugins: [artProxyPlugin()],
  resolve: {
    alias: {
      buffer: path.resolve(import.meta.dirname, 'src/buffer-shim.ts'),
      jszip: path.resolve(import.meta.dirname, 'src/jszip-shim.ts'),
    },
  },
  define: {
    global: 'globalThis',
  },
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['koishipro-core.js'],
  },
  server: { port: 5173 },
});
