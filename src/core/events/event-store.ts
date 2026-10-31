import type { Temporal } from '../temporal'
import { temporalAdapter, type DateAdapter } from '../date-adapter'
import { systemTimeZone } from '../dates'
import { expandSeries } from '../recurrence'
import {
  defaultAccessors,
  type EventAccessors,
  type EventId,
  type EventOccurrence,
  type ResourceId,
  type SchedulerEvent,
  type TimeWindow,
} from '../types'
import {
  eventKey,
  normalizeEvent,
  recurrenceKey,
  type EventRecord,
  type NormalizeContext,
  type SeriesRecord,
  type SingleRecord,
} from './normalize'

export interface EventStoreOptions<T> {
  /** Display zone. Defaults to the runtime's zone. */
  timeZone?: string
  /** Zone for wall-clock times of events without their own zone. Defaults to `timeZone`. */
  eventTimeZone?: string
  accessors?: EventAccessors<T>
  adapter?: Pick<DateAdapter<unknown>, 'parse'>
  /** Length of timed events without an end. Default one hour. */
  defaultTimedDurationMs?: number
  /** Length of all-day events without an end, in days. Default 1. */
  defaultAllDayDays?: number
  /** Order of occurrences returned by `query`. Default: all-day first, then start, then longest. */
  eventOrder?: (a: EventOccurrence<T>, b: EventOccurrence<T>) => number
  /** Called for events that cannot be read, or that reuse an id. Defaults to `console.warn`. */
  onInvalidEvent?: (error: unknown, event: T) => void
}

export interface QueryFilter {
  /** Only occurrences assigned to at least one of these resources. */
  resourceIds?: Iterable<ResourceId>
}

const MAX_CACHED_OCCURRENCES = 2_000

export function defaultEventOrder(
  a: EventOccurrence<unknown>,
  b: EventOccurrence<unknown>,
): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  return (
    a.startMs - b.startMs ||
    b.endMs - b.startMs - (a.endMs - a.startMs) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  )
}

/**
 * Holds the events, expands recurring ones for the requested window, and answers range queries.
 *
 * - Non-recurring events are normalized once and kept sorted by start, so a query is a binary
 *   search plus a short scan.
 * - Recurring series are expanded only for the window that is asked for. Generated occurrence
 *   objects are cached per series, so the same occurrence keeps the same object identity across
 *   queries (cheap for `v-memo` and keyed rendering).
 * - Updates are incremental: `upsert`/`remove` only re-normalize the touched events.
 */
export class EventStore<T = SchedulerEvent> {
  private ctx!: NormalizeContext<T>
  private order!: (a: EventOccurrence<T>, b: EventOccurrence<T>) => number
  private onInvalid!: (error: unknown, event: T) => void

  private records = new Map<string, EventRecord<T>>()
  private dirty = true
  private singles: SingleRecord<T>[] = []
  private series: SeriesRecord<T>[] = []
  private maxSingleDurationMs = 0
  /** seriesKey -> recurrence keys replaced by exception events */
  private exceptions = new Map<string, Set<string>>()
  /** seriesKey -> recurrenceKey -> occurrence, so identity is stable between queries */
  private occurrenceCache = new Map<string, Map<string, EventOccurrence<T>>>()

  /** Incremented on every change. Handy as a cheap dependency for reactive wrappers. */
  version = 0

  constructor(events: readonly T[] = [], options: EventStoreOptions<T> = {}) {
    this.configure(options)
    this.setEvents(events)
  }

  get size(): number {
    return this.records.size
  }

  /** Changes options. Changing zones or accessors re-reads every event. */
  configure(options: EventStoreOptions<T>): void {
    const timeZone = options.timeZone ?? this.ctx?.timeZone ?? systemTimeZone()
    this.ctx = {
      accessors:
        options.accessors ??
        this.ctx?.accessors ??
        (defaultAccessors as unknown as EventAccessors<T>),
      adapter: options.adapter ?? this.ctx?.adapter ?? temporalAdapter,
      timeZone,
      eventTimeZone: options.eventTimeZone ?? timeZone,
      defaultTimedDurationMs:
        options.defaultTimedDurationMs ?? this.ctx?.defaultTimedDurationMs ?? 3_600_000,
      defaultAllDayDays: options.defaultAllDayDays ?? this.ctx?.defaultAllDayDays ?? 1,
    }
    this.order = options.eventOrder ?? this.order ?? defaultEventOrder
    this.onInvalid =
      options.onInvalidEvent ??
      this.onInvalid ??
      ((error, event) => console.warn('[orb-scheduler] Skipping invalid event', event, error))
    if (this.records.size)
      this.replaceAll(
        [...this.records.values()].map((r) => r.event),
        false,
      )
  }

  get timeZone(): string {
    return this.ctx.timeZone
  }

  /**
   * Replaces all events. Event objects that were already in the store (same object, same id) are
   * not re-read, so passing a new array with one added or changed event is cheap.
   * Treat event objects as immutable: replace an object to change it.
   */
  setEvents(events: readonly T[]): void {
    this.replaceAll(events, true)
  }

  private replaceAll(events: readonly T[], reuse: boolean): void {
    const previous = this.records
    this.records = new Map()
    for (const event of events) {
      const key = eventKey(this.ctx.accessors.id(event))
      if (this.records.has(key))
        this.onInvalid(new Error(`Duplicate event id "${key}"; the later event wins`), event)
      const old = reuse ? previous.get(key) : undefined
      if (old && old.event === event) this.records.set(key, old)
      else this.add(event)
    }
    for (const key of this.occurrenceCache.keys()) {
      if (!reuse || previous.get(key) !== this.records.get(key)) this.occurrenceCache.delete(key)
    }
    this.touch()
  }

  /** Adds or replaces events by id. */
  upsert(events: T | readonly T[]): void {
    for (const event of Array.isArray(events) ? (events as readonly T[]) : [events as T]) {
      this.occurrenceCache.delete(eventKey(this.ctx.accessors.id(event)))
      this.add(event)
    }
    this.touch()
  }

  remove(ids: EventId | readonly EventId[]): void {
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      const key = eventKey(id)
      this.records.delete(key)
      this.occurrenceCache.delete(key)
    }
    this.touch()
  }

  get(id: EventId): T | undefined {
    return this.records.get(eventKey(id))?.event
  }

  has(id: EventId): boolean {
    return this.records.has(eventKey(id))
  }

  /** Whether an exception event replaces this occurrence of a series. */
  hasException(
    seriesId: EventId,
    recurrenceId: Temporal.ZonedDateTime | Temporal.PlainDate,
  ): boolean {
    this.rebuild()
    return this.exceptions.get(eventKey(seriesId))?.has(recurrenceKey(recurrenceId)) ?? false
  }

  all(): T[] {
    return [...this.records.values()].map((r) => r.event)
  }

  /** All occurrences overlapping `window`, sorted by `eventOrder`. */
  query(window: TimeWindow, filter: QueryFilter = {}): EventOccurrence<T>[] {
    this.rebuild()
    const resources = filter.resourceIds ? new Set(filter.resourceIds) : undefined
    const matchesResource = (ids: readonly ResourceId[]) =>
      !resources || ids.some((id) => resources.has(id))
    const out: EventOccurrence<T>[] = []

    // Singles are sorted by start: skip those starting after the window, and those that start so
    // early that even the longest event cannot reach the window.
    const singles = this.singles
    const upper = lowerBound(singles, window.endMs)
    const lower = lowerBound(singles, window.startMs - this.maxSingleDurationMs)
    for (let i = lower; i < upper; i++) {
      const record = singles[i]!
      const occ = record.occurrence
      if (overlaps(occ.startMs, occ.endMs, window) && matchesResource(record.resourceIds))
        out.push(occ)
    }

    for (const record of this.series) {
      if (!matchesResource(record.resourceIds)) continue
      for (const occ of this.expand(record, window)) out.push(occ)
    }

    return out.sort(this.order)
  }

  private add(event: T): void {
    try {
      const record = normalizeEvent(event, this.ctx)
      this.records.set(record.key, record)
    } catch (error) {
      this.onInvalid(error, event)
    }
  }

  private touch(): void {
    this.dirty = true
    this.version++
  }

  private rebuild(): void {
    if (!this.dirty) return
    this.dirty = false
    const singles: SingleRecord<T>[] = []
    const series: SeriesRecord<T>[] = []
    const exceptions = new Map<string, Set<string>>()
    let maxDuration = 0
    for (const record of this.records.values()) {
      if (record.kind === 'series') {
        series.push(record)
        continue
      }
      singles.push(record)
      const occ = record.occurrence
      maxDuration = Math.max(maxDuration, occ.endMs - occ.startMs)
      if (record.exceptionOf) {
        const { seriesKey, recurrenceKey: rk } = record.exceptionOf
        let set = exceptions.get(seriesKey)
        if (!set) exceptions.set(seriesKey, (set = new Set()))
        set.add(rk)
      }
    }
    singles.sort((a, b) => a.occurrence.startMs - b.occurrence.startMs)
    this.singles = singles
    this.series = series
    this.exceptions = exceptions
    this.maxSingleDurationMs = maxDuration
  }

  private expand(record: SeriesRecord<T>, window: TimeWindow): EventOccurrence<T>[] {
    const { timeZone } = this.ctx
    const starts = expandSeries(record.series, window, {
      displayTimeZone: timeZone,
      durationMs: record.durationMs,
      durationDays: record.durationDays,
    })
    const replaced = this.exceptions.get(record.key)
    let cache = this.occurrenceCache.get(record.key)
    // Bound memory for long navigation sessions; identity only has to be stable between nearby queries.
    if (!cache || cache.size > MAX_CACHED_OCCURRENCES)
      this.occurrenceCache.set(record.key, (cache = new Map()))

    const out: EventOccurrence<T>[] = []
    for (const original of starts) {
      const rk = recurrenceKey(original)
      if (replaced?.has(rk)) continue
      let occ = cache.get(rk)
      if (!occ) {
        const start =
          'epochMilliseconds' in original
            ? original.withTimeZone(timeZone)
            : original.toZonedDateTime({ timeZone })
        const end = record.allDay
          ? start.toPlainDate().add({ days: record.durationDays }).toZonedDateTime({ timeZone })
          : start.add({ milliseconds: record.durationMs })
        occ = Object.freeze({
          key: `${record.key}::${original.toString()}`,
          id: record.id,
          event: record.event,
          start,
          end,
          startMs: start.epochMilliseconds,
          endMs: end.epochMilliseconds,
          allDay: record.allDay,
          resourceIds: record.resourceIds,
          recurring: true,
          isException: false,
          recurrenceId: original,
          seriesId: record.id,
        })
        cache.set(rk, occ)
      }
      out.push(occ)
    }
    return out
  }
}

function overlaps(startMs: number, endMs: number, window: TimeWindow): boolean {
  // Zero-length events count when they start inside the window.
  return (
    startMs < window.endMs &&
    (endMs > window.startMs || (endMs === startMs && startMs >= window.startMs))
  )
}

/** First index whose start is >= `ms`. */
function lowerBound<T>(records: readonly SingleRecord<T>[], ms: number): number {
  let lo = 0
  let hi = records.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (records[mid]!.occurrence.startMs < ms) lo = mid + 1
    else hi = mid
  }
  return lo
}
