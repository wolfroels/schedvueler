<script setup lang="ts">
import { computed } from 'vue'
import { useSchedulerContext, useSchedulerView, weekStrategy } from '../../src'

// The example in docs/CUSTOM_VIEWS.md: a view is any component that registers itself.
const props = withDefaults(defineProps<{ name?: string }>(), { name: 'cards' })

const ctx = useSchedulerContext()
const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: 'Cards',
  strategy: weekStrategy({ weekStart: ctx.options.value.weekStart }),
  title: (range) => `Cards from ${range.start}`,
}))

const cards = computed(() =>
  ctx.occurrences.value.map((occ) => ({
    key: occ.key,
    title: ctx.accessors.value.title(occ.event),
    occ,
  })),
)
</script>

<template>
  <ul v-if="isActive" class="fixture-cards">
    <li v-for="card in cards" :key="card.key">
      <button
        type="button"
        @click="
          ctx.emit('event-click', {
            occurrence: card.occ,
            event: card.occ.event,
            view: name,
            nativeEvent: $event,
            element: $event.currentTarget,
          })
        "
      >
        {{ card.title }}
      </button>
    </li>
  </ul>
</template>
