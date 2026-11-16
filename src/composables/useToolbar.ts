import { computed, getCurrentInstance, onMounted, shallowRef, type ComputedRef } from 'vue'
import type { ToolbarSlotProps } from '../types'
import type { SchedulerContext } from './context'

/** Toolbar state and actions, as passed to the toolbar slots. */
export function useToolbar(ctx: SchedulerContext<unknown>): ComputedRef<ToolbarSlotProps> {
  // The toolbar hydrates after `<Scheduler>` has mounted. Waiting for its own mount keeps the
  // picture-in-picture button, which the server never renders, out of the hydrating render.
  const mounted = shallowRef(!getCurrentInstance())
  if (getCurrentInstance()) onMounted(() => (mounted.value = true))
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
    pictureInPicture: mounted.value && ctx.pictureInPicture.available.value,
    poppedOut: !!ctx.pictureInPicture.window.value,
    togglePictureInPicture: () => void ctx.pictureInPicture.toggle(),
  }))
}
