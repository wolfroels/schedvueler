<script setup lang="ts" generic="T = SchedulerEvent">
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
    const target = ctx.views.value[Number(e.key) - 1]
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
  <div class="orb-scheduler" :data-theme="theme" @keydown="onKeydown">
    <slot name="toolbar" v-bind="toolbarProps">
      <SchedulerToolbar v-if="toolbar" />
    </slot>
    <div class="orb-scheduler__body">
      <slot />
    </div>
    <span :id="ctx.hintId" class="orb-sr-only">{{ ctx.options.value.messages.dragHint }}</span>
    <div class="orb-sr-only" aria-live="polite" aria-atomic="true">
      {{ ctx.announcement.value }}
    </div>
  </div>
</template>
