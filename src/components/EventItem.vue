<script setup lang="ts">
import { computed, mergeProps, onMounted, ref } from 'vue'
import {
  formatDate,
  formatTime,
  formatTimeRange,
  type EventOccurrence,
  type ResourceId,
  type Temporal,
} from '../core'
import { createCancelable, whenAllowed } from '../composables/cancelable'
import { useSchedulerContext } from '../composables/context'
import type { SlotResolver } from '../composables/useSchedulerView'
import type { KeyboardStep } from '../composables/useInteraction'
import type { EventChangeKind, EventSlotProps, EventVariant } from '../types'
import { visualArrow } from './direction'
import { RenderSlot } from './RenderSlot'

const props = withDefaults(
  defineProps<{
    occurrence: EventOccurrence<unknown>
    variant: EventVariant
    view: string
    resolve: SlotResolver
    isStart?: boolean
    isEnd?: boolean
    /** Render as the drag preview: no handlers, not focusable. */
    mirror?: boolean
    /** For the drag preview: false when the current spot is not allowed. */
    valid?: boolean
    /** Resource of the column or timeline row this event is shown in. */
    resourceId?: ResourceId
    /** Minutes per keyboard step; defaults to the scheduler's snap. */
    snapMinutes?: number
    /** Date a drag counts from, when the event is not drawn on its date (a popover's list). */
    originDate?: Temporal.PlainDate
  }>(),
  { isStart: true, isEnd: true, mirror: false, valid: true },
)

const ctx = useSchedulerContext()
const interaction = ctx.interaction

const el = ref<HTMLElement>()
onMounted(() => {
  if (!props.mirror && interaction.claimFocus(props.occurrence)) el.value?.focus()
})

const SLOT_NAMES: Record<EventVariant, string[]> = {
  time: ['time-event', 'event'],
  'all-day': ['all-day-event', 'event'],
  month: ['month-event', 'event'],
  'month-timed': ['month-event', 'event'],
  list: ['event'],
  agenda: ['agenda-event', 'event'],
  timeline: ['timeline-event', 'event'],
}

// Separate so the clock ticking every minute only re-renders events that actually became past.
const isPast = computed(() => props.occurrence.endMs <= ctx.now.value.epochMilliseconds)

const slotProps = computed<EventSlotProps<unknown>>(() => {
  const occ = props.occurrence
  const { locale, hour12 } = ctx.options.value
  const accessors = ctx.accessors.value
  let timeText = ''
  if (props.variant === 'agenda') {
    // One row per day: show the part of the occurrence that falls on that day.
    const { isStart, isEnd } = props
    if (occ.allDay || (!isStart && !isEnd)) timeText = ctx.options.value.messages.allDay
    else if (isStart && isEnd) timeText = formatTimeRange(occ.start, occ.end, locale, { hour12 })
    else if (isStart) timeText = `${formatTime(occ.start, locale, { hour12 })} →`
    else timeText = `→ ${formatTime(occ.end, locale, { hour12 })}`
  } else if (!occ.allDay) {
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
    isPast: isPast.value,
    color:
      accessors.color(occ.event) ??
      ctx.resourceMap.value.get(props.resourceId ?? occ.resourceIds[0]!)?.color,
    resourceId: props.resourceId,
    isMirror: props.mirror,
    valid: props.valid,
  }
})

const eventSlot = computed(() =>
  props.mirror
    ? props.resolve('drag-preview', ...SLOT_NAMES[props.variant])
    : props.resolve(...SLOT_NAMES[props.variant]),
)
const handleSlot = computed(() => props.resolve('resize-handle'))
const contentSlot = computed(() => props.resolve('event-content'))
const extraAttrs = computed(() => ctx.options.value.eventAttrs?.(props.occurrence) ?? {})
const ownClass = computed(() => ctx.accessors.value.className(props.occurrence.event))
const textColor = computed(() => ctx.accessors.value.textColor(props.occurrence.event))

const draggable = computed(
  () => !props.mirror && props.variant !== 'agenda' && interaction.canDrag(props.occurrence),
)
// Timed events resize on the time grid and timeline; all-day events in day rows and the timeline.
const resizable = computed(
  () =>
    !props.mirror &&
    (props.variant === 'time' ||
      props.variant === 'timeline' ||
      (props.occurrence.allDay && (props.variant === 'all-day' || props.variant === 'month'))) &&
    interaction.canResize(props.occurrence),
)
// Moving and deleting from the keyboard also work where dragging does not, such as the agenda.
const canEdit = computed(
  () =>
    !props.mirror &&
    (interaction.canDrag(props.occurrence) || interaction.canResize(props.occurrence)),
)
const isDragSource = computed(() => {
  const s = interaction.state.value
  return !props.mirror && !!s?.preview && s.occurrence?.key === props.occurrence.key
})

const ariaLabel = computed(() => {
  const p = slotProps.value
  const date = formatDate(props.occurrence.start.toPlainDate(), ctx.options.value.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return [p.title, date, p.timeText].filter(Boolean).join(', ')
})

function payload<E extends Event>(nativeEvent: E) {
  return {
    occurrence: props.occurrence,
    event: props.occurrence.event,
    view: props.view,
    nativeEvent,
    element: nativeEvent.currentTarget as HTMLElement,
  }
}

function onPointerDown(e: PointerEvent, kind: EventChangeKind) {
  if (props.mirror) return
  if (kind !== 'move') e.stopPropagation()
  interaction.pointerDownOnEvent(e, props.occurrence, kind, props.view, props.originDate)
}

const ARROWS: Record<string, { days?: number; minutes?: number }> = {
  ArrowLeft: { days: -1 },
  ArrowRight: { days: 1 },
  ArrowUp: { minutes: -1 },
  ArrowDown: { minutes: 1 },
}

/**
 * On a timeline, Alt + left/right moves along the time axis (all-day events by a day), and
 * Alt + up/down moves to the previous/next resource row. Shift resizes the end instead.
 */
function timelineKey(e: KeyboardEvent, arrow: { days?: number; minutes?: number }) {
  const occ = props.occurrence
  const snap = props.snapMinutes ?? ctx.options.value.slotDuration
  const unit = occ.allDay ? Math.max(1440, Math.round(snap / 1440) * 1440) : snap
  const step: KeyboardStep = { timeline: true, fromResource: props.resourceId, snapMinutes: snap }
  if (arrow.days) step.minutes = arrow.days * unit
  else if (e.shiftKey) return
  else {
    const rows = ctx.visibleResources.value
    const index = rows.findIndex((r) => r.id === props.resourceId)
    const target = rows[index + (arrow.minutes ?? 0)]
    if (index < 0 || !target) return
    step.toResource = target.id
  }
  interaction.keyboardChange(e, occ, e.shiftKey ? 'resize-end' : 'move', props.view, step)
}

function onKeydown(e: KeyboardEvent) {
  ctx.emit('event-keydown', payload(e))
  if (e.defaultPrevented) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).click()
    return
  }
  const arrow = ARROWS[visualArrow(e.key, e.currentTarget as HTMLElement)]
  // Alt + left is also the browser's Back: never let it through, even when the move is refused.
  if (arrow && e.altKey) e.preventDefault()
  if (arrow && e.altKey && props.variant === 'timeline') {
    timelineKey(e, arrow)
    return
  }
  if (arrow && e.altKey) {
    // Alt + arrows moves by a snap step or a day; with Shift it resizes the end instead.
    const snap =
      props.snapMinutes ?? ctx.options.value.raw.snapDuration ?? ctx.options.value.slotDuration
    const step = { days: arrow.days, minutes: arrow.minutes && arrow.minutes * snap }
    interaction.keyboardChange(
      e,
      props.occurrence,
      e.shiftKey ? 'resize-end' : 'move',
      props.view,
      step,
    )
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit.value) {
    e.preventDefault()
    const occ = props.occurrence
    const { payload: request, settle } = createCancelable({
      occurrence: occ,
      event: occ.event,
      view: props.view,
      recurring: occ.recurring || occ.isException,
      scope: ctx.options.value.raw.recurrenceEditScope ?? 'this',
      nativeEvent: e,
      element: e.currentTarget as HTMLElement,
    })
    ctx.emit('before-event-delete', request)
    whenAllowed(settle(), () => {
      const { preventDefault: _p, waitUntil: _w, defaultPrevented: _d, ...rest } = request
      ctx.emit('event-delete', rest)
    })
  }
}
</script>

<template>
  <div
    ref="el"
    class="orb-event"
    :class="[
      `orb-event--${variant}`,
      ownClass,
      {
        'orb-event--custom': eventSlot,
        'orb-event--past': slotProps.isPast && !mirror,
        'orb-event--continues-before': !isStart,
        'orb-event--continues-after': !isEnd,
        'orb-event--draggable': draggable,
        'orb-event--drag-source': isDragSource,
        'orb-event--mirror': mirror,
        'orb-event--invalid': mirror && !valid,
      },
    ]"
    :style="
      slotProps.color || textColor
        ? {
            '--orb-event-color': slotProps.color,
            '--orb-event-text-color': textColor,
          }
        : undefined
    "
    :data-orb-key="mirror ? undefined : occurrence.key"
    :role="mirror ? undefined : 'button'"
    :tabindex="mirror ? undefined : 0"
    :aria-hidden="mirror ? 'true' : undefined"
    :aria-label="mirror ? undefined : ariaLabel"
    :aria-describedby="draggable || resizable ? ctx.hintId : undefined"
    v-bind="mergeProps(ctx.part('event', { occurrence, variant, mirror }), extraAttrs)"
    @pointerdown="onPointerDown($event, 'move')"
    @click="!mirror && ctx.emit('event-click', payload($event))"
    @dblclick="!mirror && ctx.emit('event-dblclick', payload($event))"
    @contextmenu="!mirror && ctx.emit('event-contextmenu', payload($event))"
    @mouseenter="!mirror && ctx.emit('event-mouseenter', payload($event))"
    @mouseleave="!mirror && ctx.emit('event-mouseleave', payload($event))"
    @keydown="!mirror && onKeydown($event)"
  >
    <RenderSlot v-if="eventSlot" :fn="eventSlot" :scope="slotProps" />
    <RenderSlot v-else :fn="contentSlot" :scope="slotProps">
      <template v-if="variant === 'agenda'">
        <span class="orb-event__time" v-bind="ctx.part('eventTime')">{{ slotProps.timeText }}</span>
        <span class="orb-event__dot" v-bind="ctx.part('eventDot')" aria-hidden="true" />
        <span class="orb-event__title" v-bind="ctx.part('eventTitle')">{{ slotProps.title }}</span>
      </template>
      <template v-else-if="variant === 'month-timed' || variant === 'list'">
        <span class="orb-event__dot" v-bind="ctx.part('eventDot')" aria-hidden="true" />
        <span v-if="slotProps.timeText" class="orb-event__time" v-bind="ctx.part('eventTime')">{{
          slotProps.timeText
        }}</span>
        <span class="orb-event__title" v-bind="ctx.part('eventTitle')">{{ slotProps.title }}</span>
      </template>
      <template v-else-if="variant === 'time' || variant === 'timeline'">
        <span class="orb-event__title" v-bind="ctx.part('eventTitle')">{{ slotProps.title }}</span>
        <span class="orb-event__time" v-bind="ctx.part('eventTime')">{{ slotProps.timeText }}</span>
      </template>
      <template v-else>
        <span
          v-if="slotProps.timeText && isStart"
          class="orb-event__time"
          v-bind="ctx.part('eventTime')"
          >{{ slotProps.timeText }}</span
        >
        <span class="orb-event__title" v-bind="ctx.part('eventTitle')">{{ slotProps.title }}</span>
      </template>
    </RenderSlot>

    <template v-if="resizable">
      <span
        v-if="isStart"
        class="orb-event__resizer orb-event__resizer--start"
        v-bind="ctx.part('resizer', { edge: 'start' })"
        aria-hidden="true"
        @pointerdown="onPointerDown($event, 'resize-start')"
      >
        <RenderSlot v-if="handleSlot" :fn="handleSlot" :scope="{ edge: 'start', variant }" />
      </span>
      <span
        v-if="isEnd"
        class="orb-event__resizer orb-event__resizer--end"
        v-bind="ctx.part('resizer', { edge: 'end' })"
        aria-hidden="true"
        @pointerdown="onPointerDown($event, 'resize-end')"
      >
        <RenderSlot v-if="handleSlot" :fn="handleSlot" :scope="{ edge: 'end', variant }" />
      </span>
    </template>
  </div>
</template>
