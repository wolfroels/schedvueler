import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitepress'

export default defineConfig({
  base: process.env.PAGES_BASE_PATH ?? '/',
  title: 'schedvueler',
  description: 'Modular, slot-driven scheduler and calendar components for Vue 3',
  cleanUrls: true,
  // The reference links to source files that are not part of the site.
  ignoreDeadLinks: [/^\/playground\/$/],
  rewrites: {
    'API.md': 'api.md',
    'RECIPES.md': 'recipes.md',
    'CUSTOM_VIEWS.md': 'custom-views.md',
    'MIGRATION.md': 'migration.md',
    'API_STABILITY.md': 'api-stability.md',
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide' },
      { text: 'AI guide', link: '/ai-implementation' },
      { text: 'Views', link: '/views' },
      { text: 'API', link: '/api' },
      { text: 'Recipes', link: '/recipes' },
      { text: 'Playground', link: '/playground/', target: '_blank' },
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'Getting started', link: '/guide' },
          { text: 'AI implementation', link: '/ai-implementation' },
          { text: 'Views', link: '/views' },
          { text: 'Customizing', link: '/customizing' },
          { text: 'Migrating', link: '/migration' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API', link: '/api' },
          { text: 'Recipes', link: '/recipes' },
          { text: 'Custom views', link: '/custom-views' },
          { text: 'API stability', link: '/api-stability' },
        ],
      },
    ],
    search: { provider: 'local' },
  },
  vite: {
    resolve: {
      alias: { '@orb': fileURLToPath(new URL('../../src', import.meta.url)) },
    },
    ssr: { noExternal: ['@tanstack/vue-virtual'] },
  },
})
