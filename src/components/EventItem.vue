<script setup lang="ts">
import { computed } from 'vue'
import { formatTime, formatTimeRange, type EventOccurrence } from '../core'
import { useSchedulerContext } from '../composables/context'
import type { SlotResolver } from '../composables/useSchedulerView'
import type { EventSlotProps, EventVariant } from '../types'
import { RenderSlot } from './RenderSlot'

const props = withDefaults(
  defineProps<{
    occurrence: EventOccurrence<unknown>
    variant: EventVariant
    view: string
    resolve: SlotResolver
    isStart?: boolean
    isEnd?: boolean
  }>(),
  { isStart: true, isEnd: true },
)

const ctx = useSchedulerContext()

const SLOT_NAMES: Record<EventVariant, string[]> = {
  time: ['time-event', 'event'],
  'all-day': ['all-day-event', 'event'],
  month: ['month-event', 'event'],
  'month-timed': ['month-event', 'event'],
  list: ['event'],
}

const slotProps = computed<EventSlotProps<unknown>>(() => {
  const occ = props.occurrence
  const { locale, hour12 } = ctx.options.value
  const accessors = ctx.accessors.value
  let timeText = ''
  if (!occ.allDay) {
    timeText =
      props.variant === 'month-timed'
        ? formatTime(occ.start, locale, { hour12, compact: true })
        : formatTimeRange(occ.start, occ.end, locale, { hour12 })
  }
  return {
    occurrence: occ,
    event: occ.event,
    title: accessors.title(occ.event) ?? '',
    timeText,
    view: props.view,
    variant: props.variant,
    allDay: occ.allDay,
    isStart: props.isStart,
    isEnd: props.isEnd,
    isPast: occ.endMs <= ctx.now.value.epochMilliseconds,
    color: accessors.color(occ.event),
  }
})

const eventSlot = computed(() => props.resolve(...SLOT_NAMES[props.variant]))
const contentSlot = computed(() => props.resolve('event-content'))
const extraAttrs = computed(() => ctx.options.value.eventAttrs?.(props.occurrence) ?? {})

function payload<E extends Event>(nativeEvent: E) {
  return {
    occurrence: props.occurrence,
    event: props.occurrence.event,
    view: props.view,
    nativeEvent,
    element: nativeEvent.currentTarget as HTMLElement,
  }
}

function onKeydown(e: KeyboardEvent) {
  ctx.emit('event-keydown', payload(e))
  if (!e.defaultPrevented && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).click()
  }
}
</script>

<template>
  <div
    class="orb-event"
    :class="[
      `orb-event--${variant}`,
      {
        'orb-event--custom': eventSlot,
        'orb-event--past': slotProps.isPast,
        'orb-event--continues-before': !isStart,
        'orb-event--continues-after': !isEnd,
      },
    ]"
    :style="slotProps.color ? { '--orb-event-color': slotProps.color } : undefined"
    role="button"
    tabindex="0"
    :aria-label="slotProps.timeText ? `${slotProps.title}, ${slotProps.timeText}` : slotProps.title"
    v-bind="extraAttrs"
    @click="ctx.emit('event-click', payload($event))"
    @dblclick="ctx.emit('event-dblclick', payload($event))"
    @contextmenu="ctx.emit('event-contextmenu', payload($event))"
    @mouseenter="ctx.emit('event-mouseenter', payload($event))"
    @mouseleave="ctx.emit('event-mouseleave', payload($event))"
    @keydown="onKeydown"
  >
    <RenderSlot v-if="eventSlot" :fn="eventSlot" :scope="slotProps" />
    <RenderSlot v-else :fn="contentSlot" :scope="slotProps">
      <template v-if="variant === 'month-timed' || variant === 'list'">
        <span class="orb-event__dot" aria-hidden="true" />
        <span v-if="slotProps.timeText" class="orb-event__time">{{ slotProps.timeText }}</span>
        <span class="orb-event__title">{{ slotProps.title }}</span>
      </template>
      <template v-else-if="variant === 'time'">
        <span class="orb-event__title">{{ slotProps.title }}</span>
        <span class="orb-event__time">{{ slotProps.timeText }}</span>
      </template>
      <template v-else>
        <span v-if="slotProps.timeText && isStart" class="orb-event__time">{{
          slotProps.timeText
        }}</span>
        <span class="orb-event__title">{{ slotProps.title }}</span>
      </template>
    </RenderSlot>
  </div>
</template>
