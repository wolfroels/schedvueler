import type { Cancelable } from '../types'

/**
 * Adds `preventDefault` / `waitUntil` to a payload. After emitting, `settle()` tells whether the
 * default action may run. It stays synchronous when nobody called `waitUntil`, so the common case
 * has no extra tick.
 */
export function createCancelable<P extends object>(
  payload: P,
): { payload: P & Cancelable; settle(): boolean | Promise<boolean> } {
  let prevented = false
  const waits: Promise<unknown>[] = []
  const full = Object.assign(payload, {
    preventDefault() {
      prevented = true
    },
    get defaultPrevented() {
      return prevented
    },
    waitUntil(promise: Promise<unknown>) {
      waits.push(promise)
    },
  }) as P & Cancelable

  return {
    payload: full,
    settle() {
      if (prevented) return false
      if (!waits.length) return true
      return Promise.all(waits).then(
        (results) => !prevented && results.every((r) => r !== false),
        () => false,
      )
    },
  }
}

/** Runs `action` once a cancelable payload settles in its favour. */
export function whenAllowed(result: boolean | Promise<boolean>, action: () => void): void {
  if (result === true) action()
  else if (result !== false) void result.then((ok) => ok && action())
}
