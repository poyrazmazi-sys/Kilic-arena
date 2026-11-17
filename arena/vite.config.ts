import { defineConfig } from 'vite';
export default defineConfig({ root: 'arena', base: './', publicDir: '../public', build: { outDir: '../dist-arena', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 } });
