<script setup lang="ts" generic="T = SchedulerEvent">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type StyleValue } from 'vue'
import { useScheduler } from '../composables/useScheduler'
import { useToolbar } from '../composables/useToolbar'
import { parseTimeOfDay, type SchedulerContext } from '../composables/context'
import {
  findOverlaps,
  formatDate,
  formatTimeRange,
  toZoned,
  type DateInput,
  type EventId,
  type EventOccurrence,
  type SchedulerEvent,
} from '../core'
import type { SchedulerDensity, SchedulerEmits, SchedulerOptions, SchedulerSlots } from '../types'
import { HydratingToolbar } from './HydratingToolbar'
import { ownerWindow } from '../composables/usePictureInPicture'

export interface SchedulerProps<T> extends SchedulerOptions<T> {
  /** Color scheme. "auto" follows the operating system. Default "light". */
  theme?: 'light' | 'dark' | 'auto'
  /** Use color-independent event markers in compact month view. Default false. */
  colorBlindMode?: boolean
  /** Show the built-in toolbar. Default true. */
  toolbar?: boolean
  /** How much room everything takes. Default "normal". */
  density?: SchedulerDensity
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<SchedulerProps<T>>(), {
  theme: 'light',
  colorBlindMode: false,
  toolbar: true,
  nowIndicator: true,
  // Absent boolean props would otherwise become false and override `editable`.
  hour12: undefined,
  eventDraggable: undefined,
  eventResizable: undefined,
  swipeNavigation: true,
  pictureInPicture: true,
})

/** Anchor date, "YYYY-MM-DD". Leave unbound to start on today. */
const date = defineModel<string>('date')
/** Active view name. Leave unbound to start on the first view. */
const view = defineModel<string>('view')

/** Keys of the selected events, with `event-selection`. */
const selectedEvents = defineModel<readonly string[]>('selectedEvents')

const emit = defineEmits<SchedulerEmits<T>>()
const slots = defineSlots<SchedulerSlots<T>>()

const ctx = useScheduler<T>(
  () => props,
  { date, view, selectedEvents },
  {
    emit: (name, payload) => (emit as (name: string, payload: unknown) => void)(name, payload),
    slots: slots as never,
  },
)
const toolbarProps = useToolbar(ctx as SchedulerContext<unknown>)

// Measure the scheduler so views can declare min/max widths.
const root = ref<HTMLElement>()
let observer: ResizeObserver | undefined
function observe() {
  observer?.disconnect()
  const el = root.value
  if (!el) return
  ctx.width.value = el.clientWidth
  // The observer of the window the scheduler is in, which changes when it is popped out.
  const Observer = ownerWindow(el).ResizeObserver
  if (!Observer) return
  observer = new Observer(([entry]) => {
    if (entry) ctx.width.value = Math.round(entry.contentRect.width)
  })
  observer.observe(el)
}
onMounted(() => {
  if (!root.value) return
  ctx.rootEl.value = root.value
  observe()
})
onBeforeUnmount(() => observer?.disconnect())

// Popped out: the root is teleported into the picture-in-picture window's body.
const pip = ctx.pictureInPicture
const pipBody = computed(() => pip.window.value?.document.body ?? null)
watch(pipBody, observe, { flush: 'post' })

// Horizontal swipe on touch screens goes to the previous/next period. Vertical scrolling stays
// with the browser (touch-action: pan-y); swipes that become a drag or selection are ignored.
let swipe: { id: number; x: number; y: number; t: number; dragged: boolean } | undefined
function onSwipeStart(e: PointerEvent) {
  if (e.pointerType === 'mouse' || props.swipeNavigation === false) return
  swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), dragged: false }
}
function onSwipeMove(e: PointerEvent) {
  if (swipe?.id === e.pointerId && ctx.interaction.state.value) swipe.dragged = true
}
function onSwipeCancel() {
  swipe = undefined
}
function onSwipeEnd(e: PointerEvent) {
  const s = swipe
  swipe = undefined
  if (!s || s.id !== e.pointerId || s.dragged || ctx.interaction.state.value) return
  const dx = e.clientX - s.x
  const dy = e.clientY - s.y
  if (Date.now() - s.t > 600 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return
  if (dx < 0) ctx.next()
  else ctx.prev()
}

// Dragging inside the scheduler is done with pointer events. A native drag starting here (a text
// selection, a link or image in a slot) would show the browser's drag ghost and cancel that
// gesture, so only elements that opt in with draggable="true" may start one.
function onNativeDragStart(e: DragEvent) {
  const target = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement
  if (!target?.closest('[draggable="true"]')) e.preventDefault()
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/** What the tooltip shows while dragging, with `drag-tooltip`. */
const tooltip = computed(() => {
  if (!props.dragTooltip) return undefined
  const s = ctx.interaction.state.value
  const at = ctx.interaction.pointer.value
  if (!s?.preview || !at || s.kind === 'select') return undefined
  const { start, end, allDay } = s.preview
  const { locale, hour12, timeZone } = ctx.options.value
  const date = formatDate(start.withTimeZone(timeZone).toPlainDate(), locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const conflicts = findOverlaps(
    ctx.occurrences.value,
    start.epochMilliseconds,
    end.epochMilliseconds,
    s.preview.resourceIds ?? s.occurrence?.resourceIds ?? [],
    s.occurrence?.key,
  )
  return {
    x: at.x,
    y: at.y,
    scope: {
      occurrence: s.occurrence as EventOccurrence<T> | undefined,
      start,
      end,
      allDay,
      timeText: allDay ? date : `${date}, ${formatTimeRange(start, end, locale, { hour12 })}`,
      minutes: (end.epochMilliseconds - start.epochMilliseconds) / 60_000,
      valid: s.valid,
      reason: s.reason,
      conflicts,
    },
  }
})

/** Whether a key event is the given combination, such as "ctrl+k" or "m". */
function matchesKey(e: KeyboardEvent, combo: string) {
  const parts = combo.toLowerCase().split('+')
  const key = parts.pop()
  return (
    e.key.toLowerCase() === key &&
    parts.includes('ctrl') === e.ctrlKey &&
    parts.includes('meta') === e.metaKey &&
    parts.includes('alt') === e.altKey &&
    parts.includes('shift') === e.shiftKey
  )
}

/** A shortcut from `keymap`; true when it was one. */
function runKeymap(e: KeyboardEvent) {
  const keymap = props.keymap
  if (!keymap) return false
  for (const [action, combo] of Object.entries(keymap)) {
    if (!combo || !matchesKey(e, combo)) continue
    e.preventDefault()
    if (action === 'prev') ctx.prev()
    else if (action === 'next') ctx.next()
    else if (action === 'today') ctx.goToday()
    else if (action.startsWith('view:')) ctx.setView(action.slice(5))
    return true
  }
  return false
}

/** Shortcuts anywhere inside the scheduler. */
function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || isTyping(e.target)) return
  if (runKeymap(e)) return
  const command = e.ctrlKey || e.metaKey
  if (command && props.eventClipboard && !e.altKey && !e.shiftKey) {
    const key = e.key.toLowerCase()
    const done =
      key === 'c'
        ? ctx.interaction.copy(false)
        : key === 'x'
          ? ctx.interaction.copy(true)
          : key === 'v'
            ? ctx.interaction.paste(e)
            : false
    if (done) e.preventDefault()
    return
  }
  if (e.key === 'PageUp' && !props.keymap?.prev) {
    e.preventDefault()
    ctx.prev()
  } else if (e.key === 'PageDown' && !props.keymap?.next) {
    e.preventDefault()
    ctx.next()
  } else if (
    (e.key === 't' || e.key === 'T') &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !props.keymap?.today
  ) {
    ctx.goToday()
  } else if (e.altKey && /^[1-9]$/.test(e.key)) {
    const target = ctx.availableViews.value[Number(e.key) - 1]
    if (target) {
      e.preventDefault()
      ctx.setView(target.definition.value.name)
    }
  } else if (e.key === 'Escape') {
    ctx.interaction.clearSelection()
    ctx.interaction.armMove(null)
    if (props.eventSelection) ctx.setSelectedEvents([])
  }
}

/** The occurrence of an event nearest after the anchor date, within a year either way. */
function findEvent(id: EventId) {
  const key = String(id)
  const anchor = ctx.date.value.toZonedDateTime({ timeZone: ctx.options.value.timeZone })
  const list = ctx.store
    .query({
      startMs: anchor.subtract({ years: 1 }).epochMilliseconds,
      endMs: anchor.add({ years: 1 }).epochMilliseconds,
    })
    .filter((o) => String(o.id) === key || String(o.seriesId) === key)
  return list.find((o) => o.startMs >= anchor.epochMilliseconds) ?? list[list.length - 1]
}

defineExpose({
  prev: ctx.prev,
  next: ctx.next,
  today: ctx.goToday,
  goTo: ctx.goTo,
  setView: ctx.setView,
  refresh: ctx.refresh,
  clearStorage: ctx.clearStorage,
  clearSelection: ctx.interaction.clearSelection,
  /** Opens the browser's print dialog; the styles lay the active view out for paper. */
  print: () => window.print(),
  /** Pops the scheduler out into a picture-in-picture window. Resolves to whether it did. */
  openPictureInPicture: pip.open,
  /** Brings the scheduler back from the picture-in-picture window. */
  closePictureInPicture: pip.close,
  /** Scrolls the active view to a time of day, "HH:mm". */
  scrollToTime(time: string) {
    ctx.interaction.scrollToMinute(parseTimeOfDay(time, 0))
  },
  /** Goes to an event (by id, the next occurrence for a series) and scrolls it into view. */
  async scrollToEvent(id: EventId): Promise<boolean> {
    const found = findEvent(id)
    if (!found) return false
    ctx.goTo(found.start.withTimeZone(ctx.options.value.timeZone).toPlainDate())
    await nextTick()
    if (!found.allDay) ctx.interaction.scrollToMinute(found.start.hour * 60 + found.start.minute)
    await nextTick()
    ctx.eventElement(found.key)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return true
  },
  /** Occurrences in a range, by default the visible one. */
  getEvents(start?: DateInput, end?: DateInput) {
    const zone = ctx.options.value.timeZone
    const win = ctx.window.value
    return ctx.store.query({
      startMs: start === undefined ? (win?.startMs ?? 0) : toZoned(start, zone).epochMilliseconds,
      endMs: end === undefined ? (win?.endMs ?? 0) : toZoned(end, zone).epochMilliseconds,
    })
  },
  /** Full headless context, for advanced use. */
  context: ctx,
})
</script>

<template>
  <div
    v-if="pipBody"
    class="schedvueler schedvueler--pip-placeholder"
    v-bind="ctx.part('pipPlaceholder')"
    :class="$attrs.class"
    :style="$attrs.style as StyleValue"
    :data-theme="theme"
    :data-density="density"
  >
    <p>{{ ctx.options.value.messages.poppedOut }}</p>
    <button type="button" class="orb-button" @click="pip.close">
      {{ ctx.options.value.messages.popIn }}
    </button>
  </div>
  <Teleport :to="pipBody ?? 'body'" :disabled="!pipBody">
    <div
      ref="root"
      class="schedvueler"
      v-bind="{ ...ctx.part('root'), ...$attrs }"
      :data-theme="theme"
      :data-density="density"
      :class="{
        'schedvueler--animate': animate,
        'schedvueler--color-blind': colorBlindMode,
        'schedvueler--pip': !!pipBody,
      }"
      @keydown="onKeydown"
      @dragstart="onNativeDragStart"
      @dragover="ctx.interaction.nativeDragOver"
      @dragleave="ctx.interaction.nativeDragLeave"
      @drop="ctx.interaction.nativeDrop"
    >
      <slot name="toolbar" v-bind="toolbarProps">
        <HydratingToolbar v-if="toolbar" />
      </slot>
      <div
        class="schedvueler__body"
        v-bind="ctx.part('body')"
        :class="{ 'schedvueler__body--swipe': swipeNavigation }"
        @pointerdown.capture="onSwipeStart"
        @pointermove.capture="onSwipeMove"
        @pointerup.capture="onSwipeEnd"
        @pointercancel.capture="onSwipeCancel"
      >
        <slot />
        <div
          v-if="error"
          class="schedvueler__overlay schedvueler__overlay--error"
          v-bind="ctx.part('error')"
          role="alert"
        >
          <slot name="error" :view="ctx.activeViewName.value" :error="error">
            {{ typeof error === 'string' ? error : ctx.options.value.messages.error }}
          </slot>
        </div>
        <div
          v-else-if="loading"
          class="schedvueler__overlay"
          v-bind="ctx.part('loading')"
          role="status"
        >
          <slot
            name="loading"
            :view="ctx.activeViewName.value"
            :label="ctx.options.value.messages.loading"
          >
            {{ ctx.options.value.messages.loading }}
          </slot>
        </div>
        <div
          v-else-if="$slots.empty && !ctx.occurrences.value.length"
          class="schedvueler__overlay schedvueler__overlay--empty"
          v-bind="ctx.part('empty')"
        >
          <slot
            name="empty"
            :view="ctx.activeViewName.value"
            :label="ctx.options.value.messages.noEvents"
          />
        </div>
      </div>
      <div v-if="draft" class="orb-draft-bar" v-bind="ctx.part('draftBar')" role="status">
        <slot name="draft-bar" v-bind="draft">
          <span>{{ ctx.options.value.messages.draftChanges(draft.count) }}</span>
          <button type="button" class="orb-button" @click="draft.apply">
            {{ ctx.options.value.messages.apply }}
          </button>
          <button type="button" class="orb-button" @click="draft.discard">
            {{ ctx.options.value.messages.discard }}
          </button>
        </slot>
      </div>
      <div
        v-if="tooltip"
        class="orb-drag-tooltip"
        v-bind="ctx.part('dragTooltip')"
        :style="{ left: `${tooltip.x + 14}px`, top: `${tooltip.y + 14}px` }"
        aria-hidden="true"
      >
        <slot name="drag-tooltip" v-bind="tooltip.scope">
          <span>{{ tooltip.scope.timeText }}</span>
          <small v-if="tooltip.scope.conflicts.length">
            {{ ctx.options.value.messages.conflict }}
          </small>
        </slot>
      </div>
      <div
        v-if="ctx.interaction.marquee.value"
        class="orb-marquee"
        v-bind="ctx.part('marquee')"
        :style="{
          left: `${ctx.interaction.marquee.value.left}px`,
          top: `${ctx.interaction.marquee.value.top}px`,
          width: `${ctx.interaction.marquee.value.width}px`,
          height: `${ctx.interaction.marquee.value.height}px`,
        }"
        aria-hidden="true"
      />
      <span :id="ctx.hintId" class="orb-sr-only">{{ ctx.options.value.messages.dragHint }}</span>
      <div class="orb-sr-only" aria-live="polite" aria-atomic="true">
        {{ ctx.announcement.value }}
      </div>
    </div>
  </Teleport>
</template>
