import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Production build of the playground, for measuring real (non-dev) rendering performance:
// `npm run playground:build` then `npm run playground:preview`.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-playground',
    copyPublicDir: false,
  },
  preview: {
    port: 6180,
  },
})
