<script setup lang="ts">
import { computed } from 'vue'
import { monthStrategy } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import type { SchedulerSlots } from '../types'
import MonthGrid from './MonthGrid.vue'
import { monthTitle } from './view-props'

export interface MonthViewProps {
  name?: string
  label?: string
  /**
   * Rows per day cell, including the "+N more" row. "auto" fits as many as the cell height allows.
   * Default "auto".
   */
  maxEventRows?: number | 'auto'
  /** Always show six weeks. Default false. */
  fixedWeeks?: boolean
  weekStart?: number
  hiddenDays?: readonly number[]
}

const props = withDefaults(defineProps<MonthViewProps>(), {
  name: 'month',
  maxEventRows: 'auto',
  fixedWeeks: false,
})
// View components are not generic, so view-level slot props carry an untyped event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots = defineSlots<SchedulerSlots<any>>()

const ctx = useSchedulerContext()
const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? 'Month',
  strategy: monthStrategy({
    weekStart: props.weekStart ?? ctx.options.value.weekStart,
    fixedWeeks: props.fixedWeeks,
  }),
  title: monthTitle,
}))

const resolve = useSlotResolver(slots as never, ctx as never)
const hiddenDays = computed(() => props.hiddenDays ?? ctx.options.value.hiddenDays)
</script>

<template>
  <MonthGrid
    v-if="isActive && ctx.range.value"
    :view="name"
    :range="ctx.range.value"
    :hidden-days="hiddenDays"
    :max-event-rows="maxEventRows"
    :resolve="resolve"
  />
</template>
