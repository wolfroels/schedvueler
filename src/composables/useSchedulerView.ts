import {
  computed,
  onBeforeUnmount,
  onBeforeUpdate,
  shallowRef,
  type ComputedRef,
  type Slot,
  type Slots,
} from 'vue'
import type { SchedulerViewDefinition } from '../types'
import { useSchedulerContext, type SchedulerContext, type ViewRegistration } from './context'

export interface SchedulerViewHandle<T> {
  ctx: SchedulerContext<T>
  definition: ComputedRef<SchedulerViewDefinition>
  isActive: ComputedRef<boolean>
}

/**
 * Registers a view with the surrounding `<Scheduler>`, in declaration order, and removes it on
 * unmount. Views can therefore be toggled with a plain `v-if`.
 */
export function useSchedulerView<T = unknown>(
  definition: () => SchedulerViewDefinition,
): SchedulerViewHandle<T> {
  const ctx = useSchedulerContext<T>()
  const def = computed(definition)
  const registration: ViewRegistration = { id: Symbol(def.value.name), definition: def }
  ctx.registerView(registration)
  onBeforeUnmount(() => ctx.unregisterView(registration))
  return { ctx, definition: def, isActive: computed(() => ctx.activeView.value === registration) }
}

/**
 * Looks up a slot by name, first on the calling view component, then on `<Scheduler>`.
 * Pass several names to fall back from specific to generic, e.g. `('month-event', 'event')`.
 *
 * Lookups are reactive: they re-run when the view or the scheduler re-renders with new slot
 * functions, so slots added with `v-if` or reading parent state show up in nested parts.
 * Call it during component setup.
 */
export function useSlotResolver(viewSlots: Slots | undefined, ctx: SchedulerContext<unknown>) {
  const viewVersion = shallowRef(0)
  onBeforeUpdate(() => viewVersion.value++)
  return (...names: string[]): Slot | undefined => {
    void viewVersion.value
    void ctx.slotsVersion.value
    for (const name of names) {
      const slot = viewSlots?.[name] ?? ctx.slots[name]
      if (slot) return slot
    }
    return undefined
  }
}

export type SlotResolver = ReturnType<typeof useSlotResolver>
