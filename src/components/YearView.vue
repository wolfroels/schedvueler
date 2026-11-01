<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from 'vue'
import { Temporal, formatDate, yearStrategy } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import { useYearGrid, type YearDayCell, type YearMonth } from '../composables/useYearGrid'
import type { SchedulerSlots } from '../types'
import { visualArrow } from './direction'
import { RenderSlot } from './RenderSlot'
import YearPlanner from './YearPlanner.vue'
import type { ResponsiveViewProps } from './view-props'

export interface YearViewProps extends ResponsiveViewProps {
  name?: string
  label?: string
  /**
   * How days with events are marked: a dot, a background that darkens with the count, or "planner":
   * one row per month with event bars.
   */
  display?: 'dots' | 'heatmap' | 'planner'
  /** View opened when a month name is clicked, if it exists. Default "month". */
  monthView?: string
  weekStart?: number
  hiddenDays?: readonly number[]
}

const props = withDefaults(defineProps<YearViewProps>(), {
  name: 'year',
  display: 'dots',
  monthView: 'month',
})
// View components are not generic, so view-level slot props carry an untyped event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots = defineSlots<SchedulerSlots<any>>()

const ctx = useSchedulerContext()
const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? 'Year',
  strategy: yearStrategy(),
  title: (range, locale) => formatDate(range.start, locale, { year: 'numeric' }),
  minWidth: props.minWidth,
  maxWidth: props.maxWidth,
}))

const resolve = useSlotResolver(slots as never, ctx as never)

const { weekdays, months } = useYearGrid(ctx, () => ({
  start: ctx.range.value?.start ?? ctx.date.value.with({ month: 1, day: 1 }),
  weekStart: props.weekStart ?? ctx.options.value.weekStart,
  hiddenDays: props.hiddenDays ?? ctx.options.value.hiddenDays,
}))

const messages = computed(() => ctx.options.value.messages)
const showWeeks = computed(() => !!ctx.options.value.raw.weekNumbers)

/** The week of a row of cells, read from a day in it. */
function weekScope(month: YearMonth<unknown>, index: number) {
  const row = month.cells.slice(index, index + weekdays.value.length)
  const date = row.find((c) => c)?.date ?? month.date
  return { view: props.name, week: date.weekOfYear ?? 0, date }
}

function dayLabel(cell: YearDayCell<unknown>) {
  const date = formatDate(cell.date, ctx.options.value.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const count = cell.occurrences.length
  return count ? `${date}, ${messages.value.eventCount(count)}` : date
}

function daySlotProps(cell: YearDayCell<unknown>) {
  return {
    view: props.name,
    date: cell.date,
    dayNumber: cell.dayNumber,
    isToday: cell.isToday,
    count: cell.occurrences.length,
    occurrences: cell.occurrences,
    level: cell.level,
  }
}

function onDayClick(cell: YearDayCell<unknown>, e: MouseEvent) {
  focusDate.value = cell.date
  ctx.openDate(cell.date, props.name, e)
}

function onMonthClick(month: YearMonth<unknown>) {
  if (!ctx.views.value.some((v) => v.definition.value.name === props.monthView)) return
  ctx.setView(props.monthView)
  ctx.goTo(month.date)
}

// --- keyboard: roving focus over the days ------------------------------------------------------

const root = ref<HTMLElement>()
const focusDate = shallowRef<Temporal.PlainDate>()

const activeDate = computed(() => {
  const range = ctx.range.value
  const f = focusDate.value
  if (
    f &&
    range &&
    Temporal.PlainDate.compare(f, range.start) >= 0 &&
    Temporal.PlainDate.compare(f, range.end) < 0
  )
    return f
  const today = ctx.today.value
  return today.year === range?.start.year ? today : range?.start
})

const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

function onDayKeydown(e: KeyboardEvent, cell: YearDayCell<unknown>) {
  const step = STEPS[visualArrow(e.key, e.currentTarget as HTMLElement)]
  if (step === undefined) return
  e.preventDefault()
  let next = cell.date.add({ days: step })
  const hidden = props.hiddenDays ?? ctx.options.value.hiddenDays
  while (hidden.includes(next.dayOfWeek)) next = next.add({ days: Math.sign(step) })
  focusDate.value = next
  if (next.year !== cell.date.year) ctx.goTo(next)
  nextTick(() => root.value?.querySelector<HTMLElement>(`[data-date="${next}"]`)?.focus())
}
</script>

<template>
  <YearPlanner v-if="isActive && display === 'planner'" :view="name" :resolve="resolve" />
  <div
    v-else-if="isActive"
    ref="root"
    class="orb-year"
    v-bind="ctx.part('year')"
    :class="`orb-year--${display}`"
    role="group"
    :aria-label="ctx.title.value"
  >
    <section
      v-for="month in months"
      :key="month.key"
      class="orb-year__month"
      v-bind="ctx.part('yearMonth', month)"
      :aria-label="month.label"
    >
      <button
        type="button"
        class="orb-year__month-title"
        v-bind="ctx.part('yearMonthTitle', month)"
        @click="onMonthClick(month)"
      >
        <RenderSlot
          :fn="resolve('year-month-header')"
          :scope="{ view: name, date: month.date, label: month.label }"
        >
          {{ month.label }}
        </RenderSlot>
      </button>
      <div
        class="orb-year__grid"
        :class="{ 'orb-year__grid--weeks': showWeeks }"
        :style="{ '--orb-year-cols': weekdays.length }"
      >
        <span v-if="showWeeks" />
        <span
          v-for="w in weekdays"
          :key="w.weekday"
          class="orb-year__weekday"
          v-bind="ctx.part('yearWeekday', w)"
          aria-hidden="true"
        >
          {{ w.label }}
        </span>
        <template v-for="(cell, i) in month.cells" :key="cell?.key ?? `pad-${i}`">
          <span
            v-if="showWeeks && i % weekdays.length === 0"
            class="orb-week-number"
            v-bind="ctx.part('weekNumber', { month })"
          >
            <RenderSlot :fn="resolve('week-number')" :scope="weekScope(month, i)">
              {{ weekScope(month, i).week }}
            </RenderSlot>
          </span>
          <span v-if="!cell" class="orb-year__pad" />
          <button
            v-else
            type="button"
            class="orb-year__day"
            v-bind="ctx.part('yearDay', cell)"
            :class="[
              {
                'is-today': cell.isToday,
                'is-past': cell.isPast,
                'is-weekend': cell.isWeekend,
                'has-events': cell.level > 0,
              },
              cell.level ? `orb-year__day--level-${cell.level}` : undefined,
            ]"
            :data-date="cell.key"
            :tabindex="activeDate?.equals(cell.date) ? 0 : -1"
            :aria-label="dayLabel(cell)"
            :aria-current="cell.isToday ? 'date' : undefined"
            @click="onDayClick(cell, $event)"
            @keydown="onDayKeydown($event, cell)"
          >
            <RenderSlot :fn="resolve('year-day')" :scope="daySlotProps(cell)">
              <span class="orb-year__daynum">{{ cell.dayNumber }}</span>
              <span v-if="display === 'dots' && cell.level" class="orb-year__dot" />
            </RenderSlot>
          </button>
        </template>
      </div>
    </section>
  </div>
</template>
