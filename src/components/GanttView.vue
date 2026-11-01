<script setup lang="ts">
import { computed } from 'vue'
import { rangeDays } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import type { SchedulerSlots } from '../types'
import Timeline from './Timeline.vue'
import { periodView, type TimelineSettings, type TimelineViewProps } from './view-props'

/** One row per event, with progress, milestones and dependency arrows. */
const props = withDefaults(defineProps<Omit<TimelineViewProps, 'resourceIds'>>(), {
  name: 'gantt',
  period: 'month',
  eventHeight: 24,
  rowMinHeight: 32,
  virtual: true,
})
// View components are not generic, so view-level slot props carry an untyped event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots = defineSlots<SchedulerSlots<any>>()

const ctx = useSchedulerContext()
const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? 'Gantt',
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

const settings = computed<TimelineSettings>(() => {
  const slotDuration = props.slotDuration ?? 1440
  return {
    slotDuration,
    slotLabelInterval: props.slotLabelInterval,
    snapDuration: props.snapDuration ?? (slotDuration >= 1440 ? 1440 : 15),
    dayStartTime: props.dayStartTime,
    dayEndTime: props.dayEndTime,
    scrollTime: props.scrollTime,
    slotWidth: props.slotWidth ?? 48,
    resourceAreaWidth: props.resourceAreaWidth,
    eventHeight: props.eventHeight,
    rowMinHeight: props.rowMinHeight,
    virtual: props.virtual,
    byEvent: true,
    headerTiers: props.headerTiers,
    dependencies: true,
  }
})
</script>

<template>
  <Timeline v-if="isActive" :view="name" :days="days" :settings="settings" :resolve="resolve" />
</template>
