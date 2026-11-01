import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'orb-scheduler',
  description: 'Modular, slot-driven scheduler and calendar components for Vue 3',
  cleanUrls: true,
  // The reference links to source files that are not part of the site.
  ignoreDeadLinks: [/\.\.\/src/, /ROADMAP/],
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
      { text: 'Views', link: '/views' },
      { text: 'API', link: '/api' },
      { text: 'Recipes', link: '/recipes' },
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'Getting started', link: '/guide' },
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
