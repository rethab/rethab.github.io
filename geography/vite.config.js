import { defineConfig } from 'vite';

// Sources live in src/ and the build lands in this directory itself, so Jekyll serves it at /geography/.
export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '..',
    emptyOutDir: false,
    // The bundled world-atlas borders alone are ~750 kB.
    chunkSizeWarningLimit: 1500,
  },
});
