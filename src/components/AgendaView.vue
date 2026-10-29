<script setup lang="ts">
import { computed } from 'vue'
import { rangeDays } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import type { SchedulerSlots } from '../types'
import AgendaList from './AgendaList.vue'
import { periodView, type ResponsiveViewProps, type ViewPeriod } from './view-props'

export interface AgendaViewProps extends ResponsiveViewProps {
  name?: string
  label?: string
  /** Period covered: a day, the week or the month around the date. Default "week". */
  period?: ViewPeriod
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

const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? 'Agenda',
  ...periodView(props.period, props.days, ctx.options.value.weekStart),
  minWidth: props.minWidth,
  maxWidth: props.maxWidth,
}))

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
