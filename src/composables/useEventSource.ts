import { computed, shallowRef, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import { diffEvents, type EventChanges, type EventId } from '../core'
import type { RangeChangePayload, VisibleResourcesPayload } from '../types'

export interface EventSourceRequest {
  /** First day to load, "YYYY-MM-DD". */
  start: string
  /** Day after the last day. */
  end: string
  startMs: number
  endMs: number
  timeZone: string
  /** Set with `byResource`: the rows in view. */
  resourceIds?: readonly (string | number)[]
  /** Aborted when a newer request replaces this one. */
  signal: AbortSignal
}

export interface EventSourceOptions<T> {
  fetch: (request: EventSourceRequest) => Promise<readonly T[]>
  /** Reads the id, to merge results. Default `event.id`. */
  id?: (event: T) => EventId
  /** Also load per visible resource: bind `onVisibleResources`. Default false. */
  byResource?: boolean
  /** Days loaded on both sides of the visible range. Default 0. */
  padDays?: number
}

export interface EventSource<T> {
  events: ShallowRef<readonly T[]>
  loading: ComputedRef<boolean>
  error: ShallowRef<unknown>
  /** Bind to `@range-change`. */
  onRangeChange(payload: RangeChangePayload): void
  /** Bind to `@visible-resources-change`, with `byResource`. */
  onVisibleResources(payload: VisibleResourcesPayload): void
  /** Forgets what was loaded, and loads the current range again. */
  refetch(): Promise<void>
}

/**
 * Loads events for what is on screen. Ranges that were loaded before are not asked for again, and a
 * new request cancels one still running for another range.
 *
 * ```vue
 * const source = useEventSource({ fetch: ({ start, end, signal }) => api.events(start, end, signal) })
 * // <Scheduler :events="source.events.value" :loading="source.loading.value"
 * //   :error="source.error.value" @range-change="source.onRangeChange" />
 * ```
 */
export function useEventSource<T>(options: EventSourceOptions<T>): EventSource<T> {
  const id = options.id ?? ((e: T) => (e as { id: EventId }).id)
  const pad = (options.padDays ?? 0) * 86_400_000
  const events = shallowRef<readonly T[]>([])
  const error = shallowRef<unknown>()
  const running = shallowRef(0)
  const merged = new Map<string, T>()
  const loaded = new Map<string, { startMs: number; endMs: number }[]>()
  let last: RangeChangePayload | undefined
  let resourceIds: readonly (string | number)[] | undefined
  let controller: AbortController | undefined

  /** Parts of a range that were not loaded yet. */
  function missing(key: string, startMs: number, endMs: number) {
    const known = (loaded.get(key) ?? []).slice().sort((a, b) => a.startMs - b.startMs)
    const out: { startMs: number; endMs: number }[] = []
    let cursor = startMs
    for (const k of known) {
      if (k.endMs <= cursor) continue
      if (k.startMs >= endMs) break
      if (k.startMs > cursor) out.push({ startMs: cursor, endMs: k.startMs })
      cursor = Math.max(cursor, k.endMs)
    }
    if (cursor < endMs) out.push({ startMs: cursor, endMs })
    return out
  }

  async function load() {
    if (!last) return
    const range = last
    const startMs = range.startMs - pad
    const endMs = range.endMs + pad
    const groups = options.byResource && resourceIds ? resourceIds.map(String) : ['']
    const wanted = groups.flatMap((key) =>
      missing(key, startMs, endMs).map((part) => ({ key, ...part })),
    )
    if (!wanted.length) return

    controller?.abort()
    const own = new AbortController()
    controller = own
    running.value++
    error.value = undefined
    try {
      // Adjacent parts of a range are asked for once, with all their resources.
      const from = Math.min(...wanted.map((w) => w.startMs))
      const to = Math.max(...wanted.map((w) => w.endMs))
      const list = await options.fetch({
        start: range.start.toString(),
        end: range.end.toString(),
        startMs: from,
        endMs: to,
        timeZone: range.timeZone,
        resourceIds: options.byResource ? [...new Set(wanted.map((w) => w.key))] : undefined,
        signal: own.signal,
      })
      if (own.signal.aborted) return
      for (const event of list) merged.set(String(id(event)), event)
      for (const w of wanted) {
        const known = loaded.get(w.key) ?? []
        known.push({ startMs: w.startMs, endMs: w.endMs })
        loaded.set(w.key, known)
      }
      events.value = [...merged.values()]
    } catch (e) {
      if (!own.signal.aborted) error.value = e
    } finally {
      running.value--
    }
  }

  return {
    events,
    loading: computed(() => running.value > 0),
    error,
    onRangeChange(payload) {
      last = payload
      void load()
    },
    onVisibleResources(payload) {
      resourceIds = payload.resourceIds
      void load()
    },
    refetch() {
      merged.clear()
      loaded.clear()
      return load()
    },
  }
}

export interface ChangeTracking<T> {
  /** What changed since the last `markSaved`. */
  changes: ComputedRef<EventChanges<T>>
  hasChanges: ComputedRef<boolean>
  /** The current events become the new starting point. */
  markSaved(): void
  /** Puts the events back to the last saved state. */
  discard(): void
}

/** Keeps a list of created, updated and deleted events, for saving them in one batch. */
export function useChangeTracking<T>(
  events: Ref<readonly T[]>,
  id?: (event: T) => EventId,
): ChangeTracking<T> {
  const saved = shallowRef(events.value)
  const changes = computed(() => diffEvents(saved.value, events.value, id))
  return {
    changes,
    hasChanges: computed(() => {
      const c = changes.value
      return c.created.length + c.updated.length + c.deleted.length > 0
    }),
    markSaved() {
      saved.value = events.value
    },
    discard() {
      events.value = saved.value
    },
  }
}
