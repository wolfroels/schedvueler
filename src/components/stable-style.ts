import type { CSSProperties } from 'vue'

const styles = new WeakMap<object, CSSProperties>()

/**
 * The style object for a layout item, created once per item object.
 *
 * Child components re-render when a prop gets a new object, so a fresh `:style="{ ... }"` for
 * each of hundreds of events would re-render all of them whenever the grid re-renders. Layout
 * items are only recreated when the layout changes, which makes them a good cache key.
 */
export function stableStyle<I extends object>(item: I, make: (item: I) => CSSProperties) {
  let style = styles.get(item)
  if (!style) {
    style = make(item)
    styles.set(item, style)
  }
  return style
}
