<script setup lang="ts" generic="T = SchedulerEvent">
import { computed, inject, shallowRef, watch } from 'vue'
import {
  EventStore,
  Temporal,
  createAccessors,
  dayBounds,
  formatDate,
  monthStrategy,
  rangeContains,
  rangeDays,
  systemTimeZone,
  weekStartForLocale,
  type DateRange,
  type EventAccessors,
  type SchedulerEvent,
} from '../core'
import { SchedulerContextKey } from '../composables/context'

/**
 * A month to navigate with, marking busy days and the visible range. Inside `<Scheduler>` it follows
 * that scheduler; elsewhere pass `v-model:date`, and `events` to mark busy days.
 */
const props = defineProps<{
  events?: readonly T[]
  accessors?: Partial<EventAccessors<T>>
  /** Highlights these dates. Inside a scheduler: its visible range. */
  range?: DateRange
  locale?: string
  timeZone?: string
  weekStart?: number
}>()

const date = defineModel<string>('date')

defineSlots<{
  header?: (props: { title: string; prev(): void; next(): void }) => unknown
  day?: (props: {
    date: Temporal.PlainDate
    label: string
    isToday: boolean
    isSelected: boolean
    isBusy: boolean
    isOtherMonth: boolean
  }) => unknown
}>()

const ctx = inject(SchedulerContextKey, null)

const locale = computed(
  () =>
    props.locale ?? ctx?.options.value.locale ?? new Intl.DateTimeFormat().resolvedOptions().locale,
)
const zone = computed(() => props.timeZone ?? ctx?.options.value.timeZone ?? systemTimeZone())
const today = computed(() => ctx?.today.value ?? Temporal.Now.plainDateISO(zone.value))
const selected = computed(() => {
  if (date.value) return Temporal.PlainDate.from(date.value)
  return ctx?.date.value ?? today.value
})

/** The month shown; it can differ from the selected date while browsing. */
const shown = shallowRef(selected.value)
watch(selected, (value) => (shown.value = value))

const strategy = computed(() =>
  monthStrategy({
    weekStart: props.weekStart ?? ctx?.options.value.weekStart ?? weekStartForLocale(locale.value),
    fixedWeeks: true,
  }),
)
const grid = computed(() => strategy.value.range(shown.value))
const days = computed(() => rangeDays(grid.value))
const title = computed(() =>
  formatDate(grid.value.active.start, locale.value, { month: 'long', year: 'numeric' }),
)
const weekdays = computed(() =>
  days.value.slice(0, 7).map((d) => formatDate(d, locale.value, { weekday: 'narrow' })),
)

const store = computed(() =>
  props.events
    ? new EventStore(props.events, {
        timeZone: zone.value,
        accessors: createAccessors<T>(props.accessors),
      })
    : (ctx?.store as EventStore<T> | undefined),
)

const busy = computed(() => {
  void ctx?.version.value
  const set = new Set<string>()
  const list = store.value
  if (!list) return set
  const { startMs } = dayBounds(grid.value.start, zone.value)
  const { startMs: endMs } = dayBounds(grid.value.end, zone.value)
  for (const o of list.query({ startMs, endMs })) {
    const last = o.end.withTimeZone(zone.value).subtract({ nanoseconds: 1 }).toPlainDate()
    for (
      let d = o.start.withTimeZone(zone.value).toPlainDate();
      Temporal.PlainDate.compare(d, last) <= 0;
      d = d.add({ days: 1 })
    )
      set.add(d.toString())
  }
  return set
})

const highlight = computed(() => props.range ?? ctx?.range.value)

function step(direction: 1 | -1) {
  shown.value = strategy.value.step(shown.value, direction)
}

function pick(day: Temporal.PlainDate) {
  shown.value = day
  date.value = day.toString()
  ctx?.goTo(day)
}
</script>

<template>
  <div class="orb-mini" data-orb-part="miniCalendar">
    <slot name="header" :title="title" :prev="() => step(-1)" :next="() => step(1)">
      <div class="orb-mini__header">
        <button type="button" class="orb-mini__nav" aria-label="Previous month" @click="step(-1)">
          ‹
        </button>
        <span class="orb-mini__title" aria-live="polite">{{ title }}</span>
        <button type="button" class="orb-mini__nav" aria-label="Next month" @click="step(1)">
          ›
        </button>
      </div>
    </slot>
    <div class="orb-mini__grid">
      <span v-for="(w, i) in weekdays" :key="i" class="orb-mini__weekday" aria-hidden="true">
        {{ w }}
      </span>
      <button
        v-for="day in days"
        :key="day.toString()"
        type="button"
        class="orb-mini__day"
        data-orb-part="miniCalendarDay"
        :class="{
          'is-today': day.equals(today),
          'is-selected': day.equals(selected),
          'is-busy': busy.has(day.toString()),
          'is-other-month': !rangeContains(grid.active, day),
          'is-in-range': highlight && rangeContains(highlight, day),
        }"
        :data-date="day.toString()"
        :aria-label="formatDate(day, locale, { dateStyle: 'full' })"
        :aria-current="day.equals(today) ? 'date' : undefined"
        @click="pick(day)"
      >
        <slot
          name="day"
          :date="day"
          :label="formatDate(day, locale, { day: 'numeric' })"
          :is-today="day.equals(today)"
          :is-selected="day.equals(selected)"
          :is-busy="busy.has(day.toString())"
          :is-other-month="!rangeContains(grid.active, day)"
        >
          {{ formatDate(day, locale, { day: 'numeric' }) }}
        </slot>
      </button>
    </div>
  </div>
</template>
