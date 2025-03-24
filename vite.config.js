// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['kuzu-wasm']
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600, // Increase warning limit to 600 kB
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Group vendor code into separate chunks based on package name
            return id.toString().split('node_modules/')[1].split('/')[0];
          }
        }
      }
    }
  }
});