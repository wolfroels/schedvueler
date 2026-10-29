import { computed, type ComputedRef } from 'vue'
import type { ToolbarSlotProps } from '../types'
import type { SchedulerContext } from './context'

/** Toolbar state and actions, as passed to the toolbar slots. */
export function useToolbar(ctx: SchedulerContext<unknown>): ComputedRef<ToolbarSlotProps> {
  return computed(() => ({
    title: ctx.title.value,
    view: ctx.activeViewName.value,
    views: ctx.availableViews.value.map((v) => ({
      name: v.definition.value.name,
      label: v.definition.value.label,
      active: v === ctx.activeView.value,
    })),
    prev: ctx.prev,
    next: ctx.next,
    today: ctx.goToday,
    setView: ctx.setView,
  }))
}
