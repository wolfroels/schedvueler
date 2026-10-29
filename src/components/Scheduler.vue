<script setup lang="ts" generic="T = SchedulerEvent">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useScheduler } from '../composables/useScheduler'
import { useToolbar } from '../composables/useToolbar'
import type { SchedulerContext } from '../composables/context'
import type { SchedulerEvent } from '../core'
import type { SchedulerEmits, SchedulerOptions, SchedulerSlots } from '../types'
import SchedulerToolbar from './SchedulerToolbar.vue'

export interface SchedulerProps<T> extends SchedulerOptions<T> {
  /** Color scheme. "auto" follows the operating system. Default "light". */
  theme?: 'light' | 'dark' | 'auto'
  /** Show the built-in toolbar. Default true. */
  toolbar?: boolean
}

const props = withDefaults(defineProps<SchedulerProps<T>>(), {
  theme: 'light',
  toolbar: true,
  nowIndicator: true,
  // Absent boolean props would otherwise become false and override `editable`.
  hour12: undefined,
  eventDraggable: undefined,
  eventResizable: undefined,
  swipeNavigation: true,
})

/** Anchor date, "YYYY-MM-DD". Leave unbound to start on today. */
const date = defineModel<string>('date')
/** Active view name. Leave unbound to start on the first view. */
const view = defineModel<string>('view')

const emit = defineEmits<SchedulerEmits<T>>()
const slots = defineSlots<SchedulerSlots<T>>()

const ctx = useScheduler<T>(
  () => props,
  { date, view },
  {
    emit: (name, payload) => (emit as (name: string, payload: unknown) => void)(name, payload),
    slots: slots as never,
  },
)
const toolbarProps = useToolbar(ctx as SchedulerContext<unknown>)

// Measure the scheduler so views can declare min/max widths.
const root = ref<HTMLElement>()
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!root.value) return
  ctx.width.value = root.value.clientWidth
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(([entry]) => {
    if (entry) ctx.width.value = Math.round(entry.contentRect.width)
  })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

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

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/** Shortcuts anywhere inside the scheduler. */
function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || isTyping(e.target)) return
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault()
    if (e.key === 'PageUp') ctx.prev()
    else ctx.next()
  } else if ((e.key === 't' || e.key === 'T') && !e.altKey && !e.ctrlKey && !e.metaKey) {
    ctx.goToday()
  } else if (e.altKey && /^[1-9]$/.test(e.key)) {
    const target = ctx.availableViews.value[Number(e.key) - 1]
    if (target) {
      e.preventDefault()
      ctx.setView(target.definition.value.name)
    }
  } else if (e.key === 'Escape') {
    ctx.interaction.clearSelection()
  }
}

defineExpose({
  prev: ctx.prev,
  next: ctx.next,
  today: ctx.goToday,
  goTo: ctx.goTo,
  setView: ctx.setView,
  refresh: ctx.refresh,
  clearSelection: ctx.interaction.clearSelection,
  /** Full headless context, for advanced use. */
  context: ctx,
})
</script>

<template>
  <div ref="root" class="orb-scheduler" :data-theme="theme" @keydown="onKeydown">
    <slot name="toolbar" v-bind="toolbarProps">
      <SchedulerToolbar v-if="toolbar" />
    </slot>
    <div
      class="orb-scheduler__body"
      :class="{ 'orb-scheduler__body--swipe': swipeNavigation }"
      @pointerdown.capture="onSwipeStart"
      @pointermove.capture="onSwipeMove"
      @pointerup.capture="onSwipeEnd"
      @pointercancel.capture="onSwipeCancel"
    >
      <slot />
    </div>
    <span :id="ctx.hintId" class="orb-sr-only">{{ ctx.options.value.messages.dragHint }}</span>
    <div class="orb-sr-only" aria-live="polite" aria-atomic="true">
      {{ ctx.announcement.value }}
    </div>
  </div>
</template>
