/**
 * Undo/redo over immutable snapshots, e.g. the events array. Edits like `applyEventEdit` return a
 * new array that shares every unchanged event object, so keeping many snapshots is cheap.
 */
export interface History<S> {
  /** The current snapshot. */
  readonly present: S
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** Label of the change that `undo()` / `redo()` would revert / reapply. */
  readonly undoLabel: string | undefined
  readonly redoLabel: string | undefined
  /** Records a new snapshot. Clears the redo stack. */
  push(next: S, label?: string): void
  /** Steps back and returns the snapshot to show, or `undefined` when there is nothing to undo. */
  undo(): S | undefined
  redo(): S | undefined
  /** Forgets all steps and starts over from `present` (or the given snapshot). */
  reset(present?: S): void
}

export interface HistoryOptions {
  /** Maximum number of undo steps kept. Default 100. */
  limit?: number
}

interface Step<S> {
  state: S
  /** The change that led to this state. */
  label: string | undefined
}

export function createHistory<S>(initial: S, options: HistoryOptions = {}): History<S> {
  const limit = Math.max(1, options.limit ?? 100)
  let past: Step<S>[] = []
  let present: Step<S> = { state: initial, label: undefined }
  let future: Step<S>[] = []

  return {
    get present() {
      return present.state
    },
    get canUndo() {
      return past.length > 0
    },
    get canRedo() {
      return future.length > 0
    },
    get undoLabel() {
      return past.length ? present.label : undefined
    },
    get redoLabel() {
      return future[future.length - 1]?.label
    },
    push(next, label) {
      if (next === present.state) return
      past.push(present)
      if (past.length > limit) past = past.slice(past.length - limit)
      present = { state: next, label }
      future = []
    },
    undo() {
      const previous = past.pop()
      if (!previous) return undefined
      future.push(present)
      // The label stays with the state it produced, so redo can show it again.
      present = previous
      return present.state
    },
    redo() {
      const next = future.pop()
      if (!next) return undefined
      past.push(present)
      present = next
      return present.state
    },
    reset(state = present.state) {
      past = []
      future = []
      present = { state, label: undefined }
    },
  }
}
