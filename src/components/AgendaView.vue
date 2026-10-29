<script setup lang="ts">
import { computed } from 'vue'
import { dayStrategy, monthStrategy, rangeDays, weekStrategy, type RangeStrategy } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import type { SchedulerSlots } from '../types'
import AgendaList from './AgendaList.vue'
import { monthTitle, multiDayTitle, singleDayTitle, type ResponsiveViewProps } from './view-props'

export interface AgendaViewProps extends ResponsiveViewProps {
  name?: string
  label?: string
  /** Period covered: a day, the week or the month around the date. Default "week". */
  period?: 'day' | 'week' | 'month'
  /** Number of consecutive days from the date; overrides `period`. */
  days?: number
  /** Also list days without events. Default false. */
  showEmptyDays?: boolean
  /** Render only the visible rows. Default true. */
  virtual?: boolean
  /** Row heights in px, used for virtual scrolling. */
  dayHeaderHeight?: number
  eventRowHeight?: number
  hiddenDays?: readonly number[]
}

const props = withDefaults(defineProps<AgendaViewProps>(), {
  name: 'agenda',
  period: 'week',
  showEmptyDays: false,
  virtual: true,
  dayHeaderHeight: 36,
  eventRowHeight: 44,
})
// View components are not generic, so view-level slot props carry an untyped event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots = defineSlots<SchedulerSlots<any>>()

const ctx = useSchedulerContext()

/** The month itself, without the padding weeks of the month grid. */
function wholeMonth(): RangeStrategy {
  const month = monthStrategy()
  return {
    range(anchor) {
      const { active } = month.range(anchor)
      return { ...active, active }
    },
    step: month.step,
  }
}

const { isActive } = useSchedulerView(() => {
  const days = props.days
  const strategy = days
    ? dayStrategy({ days })
    : props.period === 'day'
      ? dayStrategy()
      : props.period === 'month'
        ? wholeMonth()
        : weekStrategy({ weekStart: ctx.options.value.weekStart })
  return {
    name: props.name,
    label: props.label ?? 'Agenda',
    strategy,
    title:
      props.period === 'month' && !days
        ? monthTitle
        : props.period === 'day' && !days
          ? singleDayTitle
          : multiDayTitle,
    minWidth: props.minWidth,
    maxWidth: props.maxWidth,
  }
})

const resolve = useSlotResolver(slots as never, ctx as never)
const days = computed(() =>
  ctx.range.value
    ? rangeDays(ctx.range.value, props.hiddenDays ?? ctx.options.value.hiddenDays)
    : [],
)
</script>

<template>
  <AgendaList
    v-if="isActive"
    :view="name"
    :days="days"
    :show-empty-days="showEmptyDays"
    :virtual="virtual"
    :day-header-height="dayHeaderHeight"
    :event-row-height="eventRowHeight"
    :resolve="resolve"
  />
</template>
