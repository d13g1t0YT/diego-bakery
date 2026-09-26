import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    sourcemap: false,
    target: 'es2022',
    manifest: true,
    rollupOptions: {
      input: {
        app: resolve(process.cwd(), 'src/main.tsx')
      }
    }
  }
});
