import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import dts from 'vite-plugin-dts'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 6173,
  },
  plugins: [vue(), vueDevTools(), dts({ tsconfigPath: './tsconfig.lib.json' })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // public/ belongs to the dev playground, not to the published package.
    copyPublicDir: false,
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        core: fileURLToPath(new URL('./src/core/index.ts', import.meta.url)),
        locales: fileURLToPath(new URL('./src/locales/index.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    rolldownOptions: {
      external: ['vue', 'temporal-polyfill', '@tanstack/vue-virtual'],
    },
  },
})
