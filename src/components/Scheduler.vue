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
  hour12: undefined,
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

defineExpose({
  prev: ctx.prev,
  next: ctx.next,
  today: ctx.goToday,
  goTo: ctx.goTo,
  setView: ctx.setView,
  refresh: ctx.refresh,
  /** Full headless context, for advanced use. */
  context: ctx,
})
</script>

<template>
  <div class="orb-scheduler" :data-theme="theme">
    <slot name="toolbar" v-bind="toolbarProps">
      <SchedulerToolbar v-if="toolbar" />
    </slot>
    <div class="orb-scheduler__body">
      <slot />
    </div>
  </div>
</template>
