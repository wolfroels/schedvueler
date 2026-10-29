import { Temporal } from '../temporal'
import { dayBounds, minutesIntoDay } from '../dates'
import type { EventOccurrence } from '../types'
import { packLanes } from './lanes'

/**
 * A horizontal time axis over a list of days, each showing the wall-clock hours
 * `dayStartMinute`-`dayEndMinute`. Positions are fractions (0-1) of the axis width.
 * Days must be ascending; gaps (hidden days) and hidden hours collapse to a point.
 */
export interface TimelineAxis {
  readonly days: readonly Temporal.PlainDate[]
  readonly dayStartMinute: number
  readonly dayEndMinute: number
  readonly startMs: number
  readonly endMs: number
  /** Position of an instant on the axis, clamped to 0-1. */
  position(ms: number): number
  /** Day and wall-clock minute at a position. */
  at(fraction: number): { date: Temporal.PlainDate; minute: number }
}

export function createTimelineAxis(
  days: readonly Temporal.PlainDate[],
  timeZone: string,
  dayStartMinute = 0,
  dayEndMinute = 1440,
): TimelineAxis {
  const windows = days.map((date) => dayBounds(date, timeZone))
  const count = days.length
  const span = Math.max(dayEndMinute - dayStartMinute, 1)

  function position(ms: number): number {
    if (!count) return 0
    // First day that ends after `ms`.
    let lo = 0
    let hi = count
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (windows[mid]!.endMs <= ms) lo = mid + 1
      else hi = mid
    }
    if (lo >= count) return 1
    const day = windows[lo]!
    if (ms <= day.startMs) return lo / count
    const minute = minutesIntoDay(
      Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(timeZone),
    )
    const inner = Math.min(Math.max((minute - dayStartMinute) / span, 0), 1)
    return (lo + inner) / count
  }

  function at(fraction: number) {
    const f = Math.min(Math.max(fraction, 0), 0.999999) * count
    const index = Math.min(Math.floor(f), count - 1)
    return { date: days[index]!, minute: dayStartMinute + (f - index) * span }
  }

  return {
    days,
    dayStartMinute,
    dayEndMinute,
    startMs: windows[0]?.startMs ?? 0,
    endMs: windows[count - 1]?.endMs ?? 0,
    position,
    at,
  }
}

export interface TimelineItem<T> {
  occurrence: EventOccurrence<T>
  /** Fractions (0-1) of the axis. */
  left: number
  width: number
  /** Stacking lane within the row, from the top. */
  lane: number
  /** The occurrence starts / ends within the axis. */
  isStart: boolean
  isEnd: boolean
}

export interface TimelineRowLayout<T> {
  items: TimelineItem<T>[]
  laneCount: number
}

/**
 * Lays out the occurrences of one timeline row: horizontal position from the axis and a lane each,
 * so overlapping events stack. Occurrences entirely in hidden hours are left out.
 * `minWidth` (a fraction) keeps very short events visible and is used for overlap.
 */
export function layoutTimelineRow<T>(
  occurrences: readonly EventOccurrence<T>[],
  axis: TimelineAxis,
  minWidth = 0,
): TimelineRowLayout<T> {
  const placed: Omit<TimelineItem<T>, 'lane'>[] = []
  for (const occ of occurrences) {
    if (occ.endMs <= axis.startMs && occ.startMs < axis.startMs) continue
    if (occ.startMs >= axis.endMs) continue
    const left = axis.position(occ.startMs)
    const right = axis.position(occ.endMs)
    if (right <= left && occ.endMs > occ.startMs) continue
    placed.push({
      occurrence: occ,
      left,
      width: Math.max(right - left, minWidth),
      isStart: occ.startMs >= axis.startMs,
      isEnd: occ.endMs <= axis.endMs,
    })
  }
  const { lanes, laneCount } = packLanes(
    placed.map((p) => ({ start: p.left, end: p.left + p.width })),
  )
  return { items: placed.map((p, i) => ({ ...p, lane: lanes[i]! })), laneCount }
}
