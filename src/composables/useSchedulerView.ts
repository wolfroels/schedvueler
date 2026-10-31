import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  shallowRef,
  type ComputedRef,
  type ShallowRef,
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
  const instance = getCurrentInstance()
  const registration: ViewRegistration = {
    id: Symbol(def.value.name),
    definition: def,
    node: () => (instance?.subTree?.el as Node | null | undefined) ?? null,
  }
  ctx.registerView(registration)
  onMounted(() => ctx.sortViews())
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
  if (viewSlots) trackSlotNames(viewSlots, viewVersion)
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

/**
 * Bumps `version` when slots are added or removed (e.g. `<template v-if #event>`). Call it
 * during setup.
 *
 * What a slot renders is already reactive: it runs inside the render of the component that
 * calls it, which tracks what it reads. Only the set of names needs a signal; bumping on every
 * parent re-render instead would re-render every event in every view each time.
 */
export function trackSlotNames(slots: Slots, version: ShallowRef<number>) {
  const names = () => Object.keys(slots).sort().join()
  let last = names()
  // Slots are already updated when beforeUpdate runs.
  onBeforeUpdate(() => {
    const next = names()
    if (next !== last) {
      last = next
      version.value++
    }
  })
}
