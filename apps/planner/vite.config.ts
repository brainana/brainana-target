import { defineConfig } from 'vite'
export default defineConfig({
  root: import.meta.dirname,
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2023' },
  server: {
    port: 5182,
    proxy: { '/api': 'http://127.0.0.1:5183', '/brainana-data': 'http://127.0.0.1:5183' },
  },
})
