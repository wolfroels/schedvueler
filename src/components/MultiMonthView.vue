<script setup lang="ts">
import { computed } from 'vue'
import { Temporal, formatDate, monthStrategy, type RangeStrategy } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import type { SchedulerSlots } from '../types'
import MonthGrid from './MonthGrid.vue'
import { multiDayTitle, type ResponsiveViewProps } from './view-props'

export interface MultiMonthViewProps extends ResponsiveViewProps {
  name?: string
  label?: string
  /** Months shown, from the month of the date. Default 3. */
  months?: number
  /** Rows per day cell, including the "+N more" row. Default 3. */
  maxEventRows?: number
  weekStart?: number
  hiddenDays?: readonly number[]
}

const props = withDefaults(defineProps<MultiMonthViewProps>(), {
  name: 'multi-month',
  months: 3,
  maxEventRows: 3,
})
// View components are not generic, so view-level slot props carry an untyped event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots = defineSlots<SchedulerSlots<any>>()

const ctx = useSchedulerContext()

const calendar = computed(() => ctx.options.value.raw.calendar)

const single = computed(() =>
  monthStrategy({
    weekStart: props.weekStart ?? ctx.options.value.weekStart,
    calendar: calendar.value,
  }),
)

/** The date a number of months from another, counted in the calendar. */
function addMonths(date: Temporal.PlainDate, months: number) {
  const inCalendar = calendar.value ? date.withCalendar(calendar.value) : date
  return inCalendar.add({ months }).withCalendar('iso8601')
}

const strategy = computed<RangeStrategy>(() => ({
  range(anchor) {
    const first = single.value.range(anchor)
    const last = single.value.range(addMonths(anchor, props.months - 1))
    return {
      start: first.start,
      end: last.end,
      active: { start: first.active.start, end: last.active.end },
    }
  },
  step: (anchor, direction) => addMonths(anchor, props.months * direction),
  keepsDayOfMonth: !calendar.value,
}))

const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? `${props.months} months`,
  strategy: strategy.value,
  title: (range, locale) =>
    multiDayTitle({ ...range, start: range.active.start, end: range.active.end }, locale),
  minWidth: props.minWidth,
  maxWidth: props.maxWidth,
}))

const resolve = useSlotResolver(slots as never, ctx as never)
const hiddenDays = computed(() => props.hiddenDays ?? ctx.options.value.hiddenDays)

const months = computed(() =>
  Array.from({ length: props.months }, (_, i) => {
    const anchor = single.value.range(addMonths(ctx.date.value, i)).active.start
    return {
      key: anchor.toString(),
      range: single.value.range(anchor),
      title: formatDate(anchor, ctx.options.value.locale, { month: 'long', year: 'numeric' }),
    }
  }),
)
</script>

<template>
  <div v-if="isActive" class="orb-multi-month" v-bind="ctx.part('multiMonth')">
    <section
      v-for="month in months"
      :key="month.key"
      class="orb-multi-month__month"
      :aria-label="month.title"
    >
      <h3 class="orb-multi-month__title" v-bind="ctx.part('multiMonthTitle', month)">
        {{ month.title }}
      </h3>
      <MonthGrid
        :view="name"
        :range="month.range"
        :hidden-days="hiddenDays"
        :max-event-rows="maxEventRows"
        :compact-width="0"
        :resolve="resolve"
      />
    </section>
  </div>
</template>
