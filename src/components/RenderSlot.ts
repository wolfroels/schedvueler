import { Fragment, h, type FunctionalComponent, type Slot } from 'vue'

/**
 * Renders `fn(scope)` when a slot function is given, otherwise its own default content.
 * The key keeps Vue from patching one into the other when a slot is added or removed later:
 * compiled default content only patches its dynamic parts, which would leave the old elements.
 */
export const RenderSlot: FunctionalComponent<{ fn?: Slot; scope?: object }> = (props, { slots }) =>
  h(
    Fragment,
    { key: props.fn ? 'slot' : 'default' },
    props.fn ? props.fn(props.scope) : slots.default?.(),
  )

RenderSlot.props = ['fn', 'scope']
RenderSlot.displayName = 'RenderSlot'
