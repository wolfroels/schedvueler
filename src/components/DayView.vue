<script setup lang="ts">
import { computed } from 'vue'
import { dayStrategy, rangeDays } from '../core'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import type { SchedulerSlots } from '../types'
import TimeGrid from './TimeGrid.vue'
import { multiDayTitle, singleDayTitle, type TimeGridViewProps } from './view-props'

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

const { ctx, isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? (props.days === 1 ? 'Day' : `${props.days} days`),
  strategy: dayStrategy({ days: props.days }),
  title: props.days === 1 ? singleDayTitle : multiDayTitle,
}))

const resolve = useSlotResolver(slots as never, ctx as never)
const days = computed(() =>
  ctx.range.value ? rangeDays(ctx.range.value, props.hiddenDays ?? []) : [],
)
</script>

<template>
  <TimeGrid v-if="isActive" :view="name" :days="days" :settings="props" :resolve="resolve" />
</template>
