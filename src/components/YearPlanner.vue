<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Temporal,
  calendarMonths,
  formatDate,
  layoutDayGridRow,
  spanRow,
  type EventOccurrence,
  type Hit,
} from '../core'
import { useSchedulerContext } from '../composables/context'
import type { SlotResolver } from '../composables/useSchedulerView'
import EventItem from './EventItem.vue'

const props = defineProps<{ view: string; resolve: SlotResolver }>()

const ctx = useSchedulerContext()
const interaction = ctx.interaction
const root = ref<HTMLElement>()

/** One row per month, with its events in lanes: a linear plan of the year. */
const rows = computed(() => {
  const start = ctx.range.value?.start ?? ctx.date.value.with({ month: 1, day: 1 })
  const { timeZone, locale } = ctx.options.value
  const mirror = interaction.mirror.value as unknown as EventOccurrence<unknown> | null
  const months = calendarMonths(start, ctx.options.value.raw.calendar)
  return months.map(({ date: first, days: length }) => {
    const days = Array.from({ length }, (_, d) => first.add({ days: d }))
    const spans = spanRow(ctx.occurrences.value, days, timeZone)
    const layout = layoutDayGridRow(
      spans.map((s) => ({ start: s.startCol, end: s.endCol })),
      days.length,
    )
    return {
      key: first.toString(),
      label: formatDate(first, locale, { month: 'short' }),
      days,
      laneCount: layout.rowCount,
      items: spans.map((s, i) => ({ ...s, lane: layout.rows[i]! })),
      mirror: mirror ? spanRow([mirror], days, timeZone) : [],
    }
  })
})

function isToday(date: Temporal.PlainDate) {
  return date.equals(ctx.today.value)
}

function hitTest(x: number, y: number): Hit | null {
  if (!root.value?.isConnected) return null
  const els = root.value.querySelectorAll<HTMLElement>('.orb-planner__days')
  for (let i = 0; i < els.length; i++) {
    const rect = els[i]!.getBoundingClientRect()
    if (y < rect.top || y >= rect.bottom || x < rect.left || x >= rect.right) continue
    const rtl = getComputedStyle(els[i]!).direction === 'rtl'
    const fraction = (rtl ? rect.right - x : x - rect.left) / rect.width
    const col = Math.min(30, Math.floor(fraction * 31))
    const days = rows.value[i]!.days
    return { zone: 'month', date: days[Math.min(col, days.length - 1)]! }
  }
  return null
}

let unregister: (() => void) | undefined
onMounted(() => {
  unregister = interaction.registerSurface({
    hitTest,
    scrollElement: () => root.value,
    snapMinutes: () => 1440,
  })
})
onBeforeUnmount(() => unregister?.())

function onDayClick(date: Temporal.PlainDate, e: MouseEvent) {
  ctx.openDate(date, props.view, e)
}

function onEmptyPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.orb-event')) return
  interaction.pointerDownOnSlot(e, props.view)
}
</script>

<template>
  <div
    ref="root"
    class="orb-planner"
    v-bind="ctx.part('yearPlanner')"
    role="group"
    :aria-label="ctx.title.value"
    @pointerdown="onEmptyPointerDown"
  >
    <div
      v-for="row in rows"
      :key="row.key"
      class="orb-planner__row"
      v-bind="ctx.part('yearPlannerRow', { row })"
    >
      <div class="orb-planner__label">{{ row.label }}</div>
      <div class="orb-planner__days" :style="{ '--orb-planner-lanes': row.laneCount }">
        <button
          v-for="(date, i) in row.days"
          :key="i"
          type="button"
          class="orb-planner__day"
          :class="{ 'is-today': isToday(date), 'is-weekend': date.dayOfWeek >= 6 }"
          :style="{ gridColumn: i + 1 }"
          :data-date="date.toString()"
          :aria-label="date.toLocaleString(ctx.options.value.locale, { dateStyle: 'full' })"
          @click="onDayClick(date, $event)"
        >
          {{ date.day }}
        </button>
        <EventItem
          v-for="item in row.items"
          :key="`${item.occurrence.key}@${row.key}`"
          :occurrence="item.occurrence"
          variant="month"
          :view="view"
          :resolve="resolve"
          :is-start="item.isStart"
          :is-end="item.isEnd"
          :style="{
            gridColumn: `${item.startCol + 1} / ${item.endCol + 1}`,
            gridRow: item.lane + 2,
          }"
        />
        <EventItem
          v-for="item in row.mirror"
          :key="`mirror-${item.startCol}`"
          :occurrence="item.occurrence"
          variant="month"
          :view="view"
          :resolve="resolve"
          :is-start="item.isStart"
          :is-end="item.isEnd"
          mirror
          :valid="interaction.mirror.value?.valid ?? true"
          :style="{ gridColumn: `${item.startCol + 1} / ${item.endCol + 1}`, gridRow: 2 }"
        />
      </div>
    </div>
  </div>
</template>
