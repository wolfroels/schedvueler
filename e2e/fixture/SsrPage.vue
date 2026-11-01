<script setup lang="ts">
import { createSSRApp, h, onMounted, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { MonthView, Scheduler, WeekView } from '../../src'

// Renders to a string as a server would, puts that in the page and hydrates it. Vue warns about
// anything that does not match, which fails the test.
const host = ref<HTMLElement>()
const html = ref('')
const state = ref('rendering')

const app = () =>
  createSSRApp({
    render: () =>
      h('div', { style: 'height: 600px' }, [
        h(
          Scheduler as never,
          {
            events: [
              { id: 'a', title: 'Alpha', start: '2026-06-15T09:00:00', end: '2026-06-15T10:00:00' },
            ],
            date: '2026-06-15',
            timeZone: 'Europe/Brussels',
            locale: 'en-GB',
            nowIndicator: false,
          },
          { default: () => [h(WeekView), h(MonthView)] },
        ),
      ]),
  })

onMounted(async () => {
  html.value = await renderToString(app())
  host.value!.innerHTML = html.value
  app().mount(host.value!)
  state.value = 'hydrated'
})
</script>

<template>
  <output class="ssr-state">{{ state }}</output>
  <div class="ssr-html" hidden>{{ html }}</div>
  <div ref="host" />
</template>
