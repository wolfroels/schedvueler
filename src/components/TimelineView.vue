<script setup lang="ts">
import { computed } from 'vue'
import { rangeDays } from '../core'
import { useSchedulerContext } from '../composables/context'
import { useSchedulerView, useSlotResolver } from '../composables/useSchedulerView'
import { validMinutes } from '../composables/validate'
import type { SchedulerSlots } from '../types'
import Timeline from './Timeline.vue'
import { periodView, type TimelineSettings, type TimelineViewProps } from './view-props'

const props = withDefaults(defineProps<TimelineViewProps>(), {
  name: 'timeline',
  period: 'day',
  eventHeight: 28,
  rowMinHeight: 44,
  virtual: true,
})
// View components are not generic, so view-level slot props carry an untyped event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots = defineSlots<SchedulerSlots<any>>()

const ctx = useSchedulerContext()
const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: props.label ?? 'Timeline',
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

/** Index into `zoomLevels`. */
const zoom = defineModel<number>('zoom', { default: 0 })
const level = computed(() => props.zoomLevels?.[zoom.value])

const settings = computed<TimelineSettings>(() => {
  const singleDay = props.period === 'day' && (props.days ?? 1) === 1
  const slotDuration = validMinutes(
    level.value?.slotDuration ?? props.slotDuration,
    singleDay ? 60 : 1440,
    'slotDuration',
  )
  const raw = ctx.options.value.raw
  return {
    slotDuration,
    slotLabelInterval: level.value?.slotLabelInterval ?? props.slotLabelInterval,
    snapDuration:
      level.value?.snapDuration ??
      props.snapDuration ??
      (slotDuration >= 1440 ? 1440 : (raw.snapDuration ?? Math.min(slotDuration, 15))),
    dayStartTime: props.dayStartTime,
    dayEndTime: props.dayEndTime,
    scrollTime: props.scrollTime,
    slotWidth: level.value?.slotWidth ?? props.slotWidth ?? (slotDuration >= 1440 ? 120 : 64),
    resourceAreaWidth: props.resourceAreaWidth,
    eventHeight: props.eventHeight,
    rowMinHeight: props.rowMinHeight,
    resourceIds: props.resourceIds,
    virtual: props.virtual,
    headerTiers: level.value?.headerTiers ?? props.headerTiers,
    dayEvents: props.dayEvents,
    zoomLevels: props.zoomLevels,
    zoomLevel: zoom.value,
    resourceSearch: props.resourceSearch,
    resourceColumns: props.resourceColumns,
    resourceAreaResizable: props.resourceAreaResizable,
    resourceReorder: props.resourceReorder,
    load: props.load,
    dependencies: props.dependencies,
  }
})
</script>

<template>
  <Timeline
    v-if="isActive"
    :view="name"
    :days="days"
    :settings="settings"
    :resolve="resolve"
    @update:zoom="zoom = $event"
  />
</template>
