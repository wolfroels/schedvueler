import type { Temporal } from '../temporal'
import { dayBounds, minutesIntoDay } from '../dates'
import type { EventOccurrence } from '../types'

/** The part of an occurrence that falls on one day column. */
export interface DaySegment<T> {
  occurrence: EventOccurrence<T>
  date: Temporal.PlainDate
  /** Index of the day in the `days` array passed in. */
  dayIndex: number
  /** Start and end clipped to the day. */
  startMs: number
  endMs: number
  /** Wall-clock minutes from midnight, 0-1440. Used to position the segment on a time axis. */
  startMinute: number
  endMinute: number
  /** The occurrence starts / ends on this day (as opposed to continuing from or into another day). */
  isStart: boolean
  isEnd: boolean
}

/** A horizontal bar across one row of days (month rows, the all-day row). */
export interface RowSpan<T> {
  occurrence: EventOccurrence<T>
  /** First column covered. */
  startCol: number
  /** Column after the last one covered. */
  endCol: number
  /** The occurrence starts / ends within this row. */
  isStart: boolean
  isEnd: boolean
}

interface DayWindow {
  date: Temporal.PlainDate
  startMs: number
  endMs: number
}

function dayWindows(days: readonly Temporal.PlainDate[], timeZone: string): DayWindow[] {
  return days.map((date) => ({ date, ...dayBounds(date, timeZone) }))
}

function touchesDay(occ: EventOccurrence<unknown>, day: DayWindow): boolean {
  if (occ.startMs === occ.endMs) return occ.startMs >= day.startMs && occ.startMs < day.endMs
  return occ.startMs < day.endMs && occ.endMs > day.startMs
}

/** First day index whose end is after `ms`. Days must be ascending. */
function firstDayEndingAfter(days: readonly DayWindow[], ms: number): number {
  let lo = 0
  let hi = days.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (days[mid]!.endMs <= ms) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Splits occurrences into per-day segments for time-grid columns.
 * Days must be ascending but need not be consecutive (hidden weekdays are fine).
 * @returns one array of segments per day, in the order of `occurrences`.
 */
export function segmentByDay<T>(
  occurrences: readonly EventOccurrence<T>[],
  days: readonly Temporal.PlainDate[],
  timeZone: string,
): DaySegment<T>[][] {
  const windows = dayWindows(days, timeZone)
  const result: DaySegment<T>[][] = windows.map(() => [])
  for (const occ of occurrences) {
    for (let i = firstDayEndingAfter(windows, occ.startMs); i < windows.length; i++) {
      const day = windows[i]!
      if (!touchesDay(occ, day)) {
        if (day.startMs >= occ.endMs) break
        continue
      }
      const isStart = occ.startMs >= day.startMs
      const isEnd = occ.endMs <= day.endMs
      const startMinute = isStart ? minutesIntoDay(occ.start.withTimeZone(timeZone)) : 0
      // Wall-clock minutes can run backwards across a DST fall-back hour; never let the end precede the start.
      const endMinute = isEnd
        ? Math.max(startMinute, minutesIntoDay(occ.end.withTimeZone(timeZone)))
        : 1440
      result[i]!.push({
        occurrence: occ,
        date: day.date,
        dayIndex: i,
        startMs: Math.max(occ.startMs, day.startMs),
        endMs: Math.min(occ.endMs, day.endMs),
        startMinute,
        endMinute: isEnd && occ.endMs === day.endMs ? 1440 : endMinute,
        isStart,
        isEnd,
      })
    }
  }
  return result
}

/**
 * Turns occurrences into horizontal spans over a row of days (one week of a month view, or the
 * all-day row of a week view). Occurrences that only touch hidden days are left out.
 */
export function spanRow<T>(
  occurrences: readonly EventOccurrence<T>[],
  days: readonly Temporal.PlainDate[],
  timeZone: string,
): RowSpan<T>[] {
  const windows = dayWindows(days, timeZone)
  const first = windows[0]
  const last = windows[windows.length - 1]
  if (!first || !last) return []
  const spans: RowSpan<T>[] = []
  for (const occ of occurrences) {
    let startCol = -1
    let endCol = -1
    for (let i = firstDayEndingAfter(windows, occ.startMs); i < windows.length; i++) {
      const day = windows[i]!
      if (!touchesDay(occ, day)) {
        if (day.startMs >= occ.endMs) break
        continue
      }
      if (startCol < 0) startCol = i
      endCol = i + 1
    }
    if (startCol < 0) continue
    spans.push({
      occurrence: occ,
      startCol,
      endCol,
      isStart: occ.startMs >= windows[startCol]!.startMs,
      isEnd: occ.endMs <= windows[endCol - 1]!.endMs,
    })
  }
  return spans
}

/**
 * Separates occurrences for the all-day row from those for the time grid.
 * @param longTimedAsAllDay also put timed events of at least 24 hours in the all-day row.
 */
export function partitionAllDay<T>(
  occurrences: readonly EventOccurrence<T>[],
  longTimedAsAllDay = false,
): { allDay: EventOccurrence<T>[]; timed: EventOccurrence<T>[] } {
  const allDay: EventOccurrence<T>[] = []
  const timed: EventOccurrence<T>[] = []
  for (const occ of occurrences) {
    if (occ.allDay || (longTimedAsAllDay && occ.endMs - occ.startMs >= 86_400_000)) allDay.push(occ)
    else timed.push(occ)
  }
  return { allDay, timed }
}

export interface DayGroup<T> {
  date: Temporal.PlainDate
  segments: DaySegment<T>[]
}

/**
 * Occurrences grouped per day, for agenda/list views. Multi-day occurrences appear on every day
 * they touch (check `isStart` / `isEnd`). Days without occurrences are left out unless
 * `includeEmpty` is set.
 */
export function groupByDay<T>(
  occurrences: readonly EventOccurrence<T>[],
  days: readonly Temporal.PlainDate[],
  timeZone: string,
  includeEmpty = false,
): DayGroup<T>[] {
  return segmentByDay(occurrences, days, timeZone)
    .map((segments, i) => ({ date: days[i]!, segments }))
    .filter((group) => includeEmpty || group.segments.length > 0)
}
