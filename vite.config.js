import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  optimizeDeps: {
    exclude: ['kuzu-wasm']
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0];
          }
        }
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          //src: 'node_modules/kuzu-wasm/multithreaded/kuzu_wasm_worker.js',
          src: 'node_modules/kuzu-wasm/kuzu_wasm_worker.js',
          dest: 'assets' // This will copy the worker file to the root of the dist folder
        }
      ]
    })
  ]
});