<script setup lang="ts">
import { computed } from 'vue'
import { dayStrategy, rangeDays } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import type { SchedulerSlots } from '../types'
import TimeGrid from './TimeGrid.vue'
import {
  endsPastMidnight,
  multiDayTitle,
  singleDayTitle,
  type TimeGridViewProps,
} from './view-props'

export interface DayViewProps extends TimeGridViewProps {
  /** Number of consecutive days. Default 1. */
  days?: number
}

const props = withDefaults(defineProps<DayViewProps>(), {
  name: 'day',
  days: 1,
  allDaySlot: true,
})
// View components are not generic, so view-level slot props carry an untyped event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots = defineSlots<SchedulerSlots<any>>()

const ctx = useSchedulerContext()
const hiddenDays = computed(() => props.hiddenDays ?? ctx.options.value.hiddenDays)

const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? (props.days === 1 ? 'Day' : `${props.days} days`),
  strategy: dayStrategy({ days: props.days, hiddenDays: hiddenDays.value }),
  minWidth: props.minWidth,
  maxWidth: props.maxWidth,
  title: props.days === 1 ? singleDayTitle : multiDayTitle,
  overnight: endsPastMidnight(props.dayEndTime, ctx.options.value.dayEndMinute),
}))

const resolve = useSlotResolver(slots as never, ctx as never)
const visibleDays = computed(() =>
  ctx.range.value ? rangeDays(ctx.range.value, hiddenDays.value) : [],
)
</script>

<template>
  <TimeGrid v-if="isActive" :view="name" :days="visibleDays" :settings="props" :resolve="resolve" />
</template>
