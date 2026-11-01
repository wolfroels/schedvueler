import { daysBetween, minutesIntoDay } from './dates'
import type { Temporal } from './temporal'
import type { EventOccurrence, ResourceId } from './types'

/** Opening hours for some weekdays. */
export interface BusinessHoursRule {
  /** ISO weekdays (1 = Monday ... 7 = Sunday). Default Monday to Friday. */
  days?: readonly number[]
  /** "HH:mm". */
  start: string
  /** "HH:mm"; "24:00" is the end of the day. */
  end: string
}

export type BusinessHours = BusinessHoursRule | readonly BusinessHoursRule[]

/** A half-open range of wall-clock minutes from midnight. */
export interface MinuteRange {
  start: number
  end: number
}

/** Why a move, resize, selection or drop was refused. */
export type RefusalReason =
  | 'date-limit'
  | 'blocked'
  | 'disabled'
  | 'business-hours'
  | 'duration'
  | 'overlap'
  /** `canDrop`, `canSelect` or `canReceive` said no. */
  | 'custom'

const WORK_WEEK = [1, 2, 3, 4, 5]

function clockMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) throw new RangeError(`Invalid time "${value}", expected "HH:mm"`)
  return Number(match[1]) * 60 + Number(match[2])
}

/** The hours a date is open, sorted and merged. */
export function openIntervals(date: Temporal.PlainDate, hours: BusinessHours): MinuteRange[] {
  const rules = ('start' in hours ? [hours] : hours) as readonly BusinessHoursRule[]
  const ranges = rules
    .filter((r) => (r.days ?? WORK_WEEK).includes(date.dayOfWeek))
    .map((r) => ({ start: clockMinutes(r.start), end: clockMinutes(r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)
  const merged: MinuteRange[] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else merged.push(range)
  }
  return merged
}

/** The rest of the visible hours `[from, to)` of a date: what is closed. */
export function closedIntervals(
  date: Temporal.PlainDate,
  hours: BusinessHours,
  from = 0,
  to = 1440,
): MinuteRange[] {
  const closed: MinuteRange[] = []
  let cursor = from
  for (const open of openIntervals(date, hours)) {
    if (open.start > cursor) closed.push({ start: cursor, end: Math.min(open.start, to) })
    cursor = Math.max(cursor, open.end)
    if (cursor >= to) break
  }
  if (cursor < to) closed.push({ start: cursor, end: to })
  return closed.filter((r) => r.end > r.start)
}

/** Whether all of a timed range falls within one open interval of each day it touches. */
export function fitsBusinessHours(
  start: Temporal.ZonedDateTime,
  end: Temporal.ZonedDateTime,
  hours: BusinessHours,
): boolean {
  const first = start.toPlainDate()
  const lastMoment = end.subtract({ nanoseconds: 1 })
  const days = Math.max(0, daysBetween(first, lastMoment.toPlainDate()))
  for (let i = 0; i <= days; i++) {
    const date = first.add({ days: i })
    const from = i === 0 ? minutesIntoDay(start) : 0
    const to = i === days ? minutesIntoDay(lastMoment) + 1 / 60_000_000 : 1440
    if (!openIntervals(date, hours).some((o) => o.start <= from && o.end >= Math.ceil(to - 1e-6)))
      return false
  }
  return true
}

/** A time nothing can be placed in, with or without a resource. */
export interface BlockedTime {
  start: unknown
  end: unknown
  /** Only this resource is blocked. Without either field, every resource is. */
  resourceId?: ResourceId
  resourceIds?: readonly ResourceId[]
  /** Shown on the blocked block, and handed to its slot. */
  title?: string
}

export interface ResolvedBlockedTime {
  startMs: number
  endMs: number
  resourceIds: readonly ResourceId[] | undefined
  source: BlockedTime
}

/** Whether a range with these resources runs into a blocked time. */
export function findBlocked(
  blocked: readonly ResolvedBlockedTime[],
  startMs: number,
  endMs: number,
  resourceIds: readonly ResourceId[] = [],
): ResolvedBlockedTime | undefined {
  return blocked.find(
    (b) =>
      b.startMs < endMs &&
      b.endMs > startMs &&
      (!b.resourceIds?.length ||
        !resourceIds.length ||
        b.resourceIds.some((id) => resourceIds.includes(id))),
  )
}

/**
 * Occurrences overlapping a range. Events with resources only conflict when they share one; an
 * event without resources conflicts with everything.
 */
export function findOverlaps<T>(
  occurrences: readonly EventOccurrence<T>[],
  startMs: number,
  endMs: number,
  resourceIds: readonly ResourceId[] = [],
  excludeKey?: string,
): EventOccurrence<T>[] {
  return occurrences.filter(
    (o) =>
      o.key !== excludeKey &&
      o.startMs < endMs &&
      o.endMs > startMs &&
      (!resourceIds.length ||
        !o.resourceIds.length ||
        o.resourceIds.some((id) => resourceIds.includes(id))),
  )
}
