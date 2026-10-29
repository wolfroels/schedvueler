import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const shared = {
  root: fileURLToPath(new URL('./', import.meta.url)),
  include: ['src/**/__tests__/**/*.test.ts'],
  environment: 'node',
}

export default defineConfig({
  test: {
    projects: [
      // Uses the runtime's native Temporal when present (Node 26+, Chrome, Firefox).
      { test: { ...shared, name: 'native' } },
      // Forces the polyfill implementation, which is what Safari users will run.
      {
        resolve: {
          alias: [{ find: /^temporal-polyfill$/, replacement: 'temporal-polyfill/implementation' }],
        },
        test: { ...shared, name: 'polyfill' },
      },
    ],
  },
})
