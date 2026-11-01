import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import SchedulerDemo from './SchedulerDemo.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SchedulerDemo', SchedulerDemo)
  },
} satisfies Theme
