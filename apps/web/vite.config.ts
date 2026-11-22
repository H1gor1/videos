import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@videos/core': path.join(rootDir, 'packages/core/src/index.ts'),
      '@videos/scenes': path.join(rootDir, 'packages/scenes/src/index.ts'),
      '@videos/overlays': path.join(rootDir, 'packages/overlays/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3456',
      '/renders': 'http://127.0.0.1:3456',
      '/project-files': 'http://127.0.0.1:3456',
      '/data-files': 'http://127.0.0.1:3456',
      '/mcp': 'http://127.0.0.1:3456',
    },
  },
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
