<script setup lang="ts">
import { computed } from 'vue'
import { rangeDays, weekStrategy } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import type { SchedulerSlots } from '../types'
import TimeGrid from './TimeGrid.vue'
import { multiDayTitle, type TimeGridViewProps } from './view-props'

export interface WeekViewProps extends TimeGridViewProps {
  /** Days shown from the start of the week, e.g. 5 for a work week. Default 7. */
  days?: number
  /** Overrides the scheduler's week start for this view. */
  weekStart?: number
}

const props = withDefaults(defineProps<WeekViewProps>(), {
  name: 'week',
  days: 7,
  allDaySlot: true,
})
// View components are not generic, so view-level slot props carry an untyped event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots = defineSlots<SchedulerSlots<any>>()

const ctx = useSchedulerContext()
const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? (props.days === 7 ? 'Week' : 'Work week'),
  strategy: weekStrategy({
    weekStart: props.weekStart ?? ctx.options.value.weekStart,
    days: props.days,
  }),
  minWidth: props.minWidth,
  maxWidth: props.maxWidth,
  title: multiDayTitle,
}))

const resolve = useSlotResolver(slots as never, ctx as never)
const days = computed(() =>
  ctx.range.value
    ? rangeDays(ctx.range.value, props.hiddenDays ?? ctx.options.value.hiddenDays)
    : [],
)
</script>

<template>
  <TimeGrid v-if="isActive" :view="name" :days="days" :settings="props" :resolve="resolve" />
</template>
