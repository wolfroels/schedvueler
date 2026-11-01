<script setup lang="ts">
import { computed } from 'vue'
import { monthStrategy, weekStrategy } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import type { SchedulerSlots } from '../types'
import MonthGrid from './MonthGrid.vue'
import { monthTitle, multiDayTitle, type ResponsiveViewProps } from './view-props'

export interface MonthViewProps extends ResponsiveViewProps {
  name?: string
  label?: string
  /**
   * Rows per day cell, including the "+N more" row. "auto" fits as many as the cell height allows.
   * Default "auto".
   */
  maxEventRows?: number | 'auto'
  /**
   * Below this scheduler width (px) days show colored dots instead of event bars, and tapping a
   * day lists its events. Default 560; 0 turns it off.
   */
  compactWidth?: number
  /** Always show six weeks. Default false. */
  fixedWeeks?: boolean
  /** Show this many weeks from the week of the date, instead of a month. */
  weeks?: number
  weekStart?: number
  hiddenDays?: readonly number[]
}

const props = withDefaults(defineProps<MonthViewProps>(), {
  name: 'month',
  maxEventRows: 'auto',
  compactWidth: 560,
  fixedWeeks: false,
})
// View components are not generic, so view-level slot props carry an untyped event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots = defineSlots<SchedulerSlots<any>>()

const ctx = useSchedulerContext()
const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? (props.weeks ? `${props.weeks} weeks` : 'Month'),
  strategy: props.weeks
    ? weekStrategy({
        weekStart: props.weekStart ?? ctx.options.value.weekStart,
        weeks: props.weeks,
      })
    : monthStrategy({
        weekStart: props.weekStart ?? ctx.options.value.weekStart,
        fixedWeeks: props.fixedWeeks,
        calendar: ctx.options.value.raw.calendar,
      }),
  title: props.weeks ? multiDayTitle : monthTitle,
  minWidth: props.minWidth,
  maxWidth: props.maxWidth,
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
    :compact-width="compactWidth"
    :resolve="resolve"
  />
</template>
