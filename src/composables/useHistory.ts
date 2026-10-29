import { computed, getCurrentScope, onScopeDispose, shallowRef, type Ref } from 'vue'
import { createHistory, type HistoryOptions } from '../core'

export interface UseHistoryOptions extends HistoryOptions {
  /**
   * Handle Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl+Y (redo) on the window, except while
   * typing in a field. Default false.
   */
  keyboard?: boolean
}

/**
 * Undo/redo for a ref holding immutable snapshots, typically the events array.
 *
 * ```ts
 * const events = ref(initialEvents)
 * const history = useHistory(events, { keyboard: true })
 * // in an event-drop handler:
 * history.commit(applyEventEdit(events.value, p.occurrence, p, opts), 'Move event')
 * ```
 *
 * Changes made with `commit` can be undone; assigning `source.value` directly bypasses history
 * (call `reset()` after loading new data).
 */
export function useHistory<S>(source: Ref<S>, options: UseHistoryOptions = {}) {
  const history = createHistory(source.value, options)
  // History is a plain object; this ref tells Vue when it changed.
  const version = shallowRef(0)
  const read = <R>(get: () => R) => computed(() => (void version.value, get()))

  function apply(state: S | undefined) {
    if (state === undefined) return false
    source.value = state
    version.value++
    return true
  }

  function commit(next: S, label?: string) {
    history.push(next, label)
    source.value = next
    version.value++
  }

  const undo = () => apply(history.undo())
  const redo = () => apply(history.redo())

  function reset(present: S = source.value) {
    history.reset(present)
    version.value++
  }

  if (options.keyboard && typeof window !== 'undefined') {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      const key = e.key.toLowerCase()
      const done =
        key === 'z' && !e.shiftKey
          ? undo()
          : (key === 'z' && e.shiftKey) || key === 'y'
            ? redo()
            : null
      if (done !== null) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    if (getCurrentScope()) onScopeDispose(() => window.removeEventListener('keydown', onKey))
  }

  return {
    commit,
    undo,
    redo,
    reset,
    canUndo: read(() => history.canUndo),
    canRedo: read(() => history.canRedo),
    undoLabel: read(() => history.undoLabel),
    redoLabel: read(() => history.redoLabel),
  }
}
