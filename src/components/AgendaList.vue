<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/vue-virtual'
import { formatDate, groupByDay, type DaySegment, type Temporal } from '../core'
import { useSchedulerContext } from '../composables/context'
import type { SlotResolver } from '../composables/useSchedulerView'
import EventItem from './EventItem.vue'
import { RenderSlot } from './RenderSlot'

const props = defineProps<{
  view: string
  days: readonly Temporal.PlainDate[]
  showEmptyDays: boolean
  virtual: boolean
  dayHeaderHeight: number
  eventRowHeight: number
  resolve: SlotResolver
}>()

const ctx = useSchedulerContext()

type Row =
  | {
      type: 'day'
      key: string
      date: Temporal.PlainDate
      label: string
      isToday: boolean
      count: number
    }
  | { type: 'event'; key: string; segment: DaySegment<unknown> }

const rows = computed<Row[]>(() => {
  const { timeZone, locale } = ctx.options.value
  const today = ctx.today.value
  const out: Row[] = []
  for (const group of groupByDay(
    ctx.occurrences.value,
    props.days,
    timeZone,
    props.showEmptyDays,
  )) {
    const key = group.date.toString()
    out.push({
      type: 'day',
      key,
      date: group.date,
      label: formatDate(group.date, locale, { weekday: 'long', day: 'numeric', month: 'long' }),
      isToday: group.date.equals(today),
      count: group.segments.length,
    })
    for (const segment of group.segments) {
      out.push({ type: 'event', key: `${key}/${segment.occurrence.key}`, segment })
    }
  }
  return out
})

const dayIndexes = computed(() => rows.value.flatMap((row, i) => (row.type === 'day' ? [i] : [])))

// --- virtual scrolling with a sticky day header ----------------------------------------------

const scroller = ref<HTMLElement>()
let activeSticky = 0

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scroller.value ?? null,
    estimateSize: (i: number) =>
      rows.value[i]?.type === 'day' ? props.dayHeaderHeight : props.eventRowHeight,
    getItemKey: (i: number) => rows.value[i]?.key ?? i,
    overscan: 10,
    // Keep the header of the day at the top rendered, so it can stick.
    rangeExtractor: (range: Range) => {
      const indexes = dayIndexes.value
      activeSticky = [...indexes].reverse().find((i) => range.startIndex >= i) ?? 0
      const next = new Set([activeSticky, ...defaultRangeExtractor(range)])
      return [...next].sort((a, b) => a - b)
    },
  })),
)

/** Rows to render now, each with its offset in the list. */
const rendered = computed(() => {
  const items = props.virtual
    ? virtualizer.value.getVirtualItems()
    : rows.value.map((_, index) => ({ index, start: 0 }))
  return items.map((item) => ({
    index: item.index,
    start: item.start,
    row: rows.value[item.index]!,
  }))
})

function rowStyle(index: number, start: number) {
  const row = rows.value[index]!
  const height = `${row.type === 'day' ? props.dayHeaderHeight : props.eventRowHeight}px`
  if (!props.virtual) return { height }
  if (row.type === 'day' && index === activeSticky)
    return { height, position: 'sticky' as const, top: 0 }
  return { height, position: 'absolute' as const, top: 0, transform: `translateY(${start}px)` }
}

function onDateClick(date: Temporal.PlainDate, e: MouseEvent) {
  ctx.openDate(date, props.view, e)
}

/** Scroll today's group into view when it is in the list. */
function scrollToToday() {
  const index = rows.value.findIndex((r) => r.type === 'day' && r.isToday)
  if (index < 0) return
  if (props.virtual) virtualizer.value.scrollToIndex(index, { align: 'start' })
  else
    scroller.value
      ?.querySelector<HTMLElement>(`[data-row="${index}"]`)
      ?.scrollIntoView({ block: 'start' })
}

onMounted(() => nextTick(scrollToToday))
watch(
  () => props.days[0]?.toString(),
  () => nextTick(scrollToToday),
)
</script>

<template>
  <div class="orb-agenda" :aria-label="ctx.title.value" role="group">
    <div v-if="!rows.length" class="orb-agenda__empty">
      <RenderSlot
        :fn="resolve('agenda-empty')"
        :scope="{ view, label: ctx.options.value.messages.noEvents }"
      >
        {{ ctx.options.value.messages.noEvents }}
      </RenderSlot>
    </div>
    <div v-else ref="scroller" class="orb-agenda__scroller">
      <div
        class="orb-agenda__list"
        role="list"
        :style="props.virtual ? { height: `${virtualizer.getTotalSize()}px` } : undefined"
      >
        <template v-for="{ index, start, row } in rendered" :key="row.key">
          <div
            v-if="row.type === 'day'"
            class="orb-agenda__day"
            :class="{ 'is-today': row.isToday }"
            :style="rowStyle(index, start)"
            :data-row="index"
            role="listitem"
          >
            <RenderSlot
              :fn="resolve('agenda-day-header')"
              :scope="{
                view,
                date: row.date,
                label: row.label,
                isToday: row.isToday,
                count: row.count,
              }"
            >
              <button
                type="button"
                class="orb-agenda__day-button"
                :aria-current="row.isToday ? 'date' : undefined"
                @click="onDateClick(row.date, $event)"
              >
                {{ row.label }}
              </button>
            </RenderSlot>
          </div>
          <div
            v-else
            class="orb-agenda__row"
            :style="rowStyle(index, start)"
            :data-row="index"
            role="listitem"
          >
            <EventItem
              :occurrence="row.segment.occurrence"
              variant="agenda"
              :view="view"
              :resolve="resolve"
              :is-start="row.segment.isStart"
              :is-end="row.segment.isEnd"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
