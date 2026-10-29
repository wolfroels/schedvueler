import type { FunctionalComponent, Slot } from 'vue'

/** Renders `fn(scope)` when a slot function is given, otherwise its own default content. */
export const RenderSlot: FunctionalComponent<{ fn?: Slot; scope?: object }> = (props, { slots }) =>
  props.fn ? props.fn(props.scope) : slots.default?.()

RenderSlot.props = ['fn', 'scope']
RenderSlot.displayName = 'RenderSlot'
