import { Temporal } from './temporal'
import { daysBetween, zonedAtMinute } from './dates'
import type { EventOccurrence } from './types'

/**
 * What the pointer is over, as reported by a view:
 * - `time`: a time-grid column, at a wall-clock minute of that day
 * - `all-day`: a day in the all-day row
 * - `month`: a day cell in a month-style grid
 */
export type Hit =
  | { zone: 'time'; date: Temporal.PlainDate; minute: number }
  | { zone: 'all-day'; date: Temporal.PlainDate }
  | { zone: 'month'; date: Temporal.PlainDate }

export interface EventTimes {
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
}

export interface InteractionOptions {
  timeZone: string
  /** Minutes that moves, resizes and selections snap to. */
  snapMinutes: number
  /** Length given to an all-day event dropped into the time grid, in minutes. */
  defaultDurationMinutes: number
}

export type ResizeEdge = 'start' | 'end'

const snapDelta = (minutes: number, snap: number) => Math.round(minutes / snap) * snap
const snapDown = (minute: number, snap: number) => Math.floor(minute / snap) * snap

function shiftWallClock(
  value: Temporal.ZonedDateTime,
  days: number,
  minutes: number,
  timeZone: string,
): Temporal.ZonedDateTime {
  return value
    .withTimeZone(timeZone)
    .toPlainDateTime()
    .add({ days, minutes })
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' })
}

function allDayTimes(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
  timeZone: string,
): EventTimes {
  return {
    start: start.toZonedDateTime({ timeZone }),
    end: end.toZonedDateTime({ timeZone }),
    allDay: true,
  }
}

function dateOf(value: Temporal.ZonedDateTime, timeZone: string): Temporal.PlainDate {
  return value.withTimeZone(timeZone).toPlainDate()
}

/**
 * New times for an occurrence dragged from `origin` to `current`.
 * - Within the time grid the start moves by the snapped distance, keeping odd start minutes.
 * - Dropping a timed event on the all-day row makes it a one-day all-day event, and the reverse
 *   gives it `defaultDurationMinutes` starting at the snapped drop time.
 * - In a month grid events move by whole days and keep their time of day.
 */
export function computeMove(
  occurrence: EventOccurrence<unknown>,
  origin: Hit,
  current: Hit,
  options: InteractionOptions,
): EventTimes {
  const { timeZone, snapMinutes } = options
  const durationMs = occurrence.endMs - occurrence.startMs

  if (current.zone === 'time') {
    if (occurrence.allDay || origin.zone !== 'time') {
      const start = zonedAtMinute(current.date, snapDown(current.minute, snapMinutes), timeZone)
      return {
        start,
        end: start.add({ minutes: options.defaultDurationMinutes }),
        allDay: false,
      }
    }
    const days = daysBetween(origin.date, current.date)
    const minutes = snapDelta(current.minute - origin.minute, snapMinutes)
    const start = shiftWallClock(occurrence.start, days, minutes, timeZone)
    return { start, end: start.add({ milliseconds: durationMs }), allDay: false }
  }

  const days = daysBetween(origin.date, current.date)
  if (occurrence.allDay) {
    const startDate = dateOf(occurrence.start, timeZone).add({ days })
    const span = daysBetween(dateOf(occurrence.start, timeZone), dateOf(occurrence.end, timeZone))
    return allDayTimes(startDate, startDate.add({ days: Math.max(span, 1) }), timeZone)
  }
  if (current.zone === 'all-day') {
    return allDayTimes(current.date, current.date.add({ days: 1 }), timeZone)
  }
  // Timed event in a month grid: same time of day, other date.
  const start = shiftWallClock(occurrence.start, days, 0, timeZone)
  return { start, end: start.add({ milliseconds: durationMs }), allDay: false }
}

/**
 * New times for an occurrence whose `edge` is dragged from `origin` to `current`.
 * Timed events resize in snapped minutes on the time grid; all-day events in whole days.
 * The event never gets shorter than one snap step or one day. Returns `null` when the pointer is
 * over a zone that cannot resize this occurrence.
 */
export function computeResize(
  occurrence: EventOccurrence<unknown>,
  edge: ResizeEdge,
  origin: Hit,
  current: Hit,
  options: InteractionOptions,
): EventTimes | null {
  const { timeZone, snapMinutes } = options

  if (!occurrence.allDay) {
    if (origin.zone !== 'time' || current.zone !== 'time') return null
    const delta =
      daysBetween(origin.date, current.date) * 1440 +
      snapDelta(current.minute - origin.minute, snapMinutes)
    const minMs = snapMinutes * 60_000
    if (edge === 'end') {
      let end = shiftWallClock(occurrence.end, 0, delta, timeZone)
      if (end.epochMilliseconds - occurrence.startMs < minMs)
        end = occurrence.start.add({ minutes: snapMinutes })
      return { start: occurrence.start, end, allDay: false }
    }
    let start = shiftWallClock(occurrence.start, 0, delta, timeZone)
    if (occurrence.endMs - start.epochMilliseconds < minMs)
      start = occurrence.end.subtract({ minutes: snapMinutes })
    return { start, end: occurrence.end, allDay: false }
  }

  if (current.zone === 'time' || origin.zone === 'time') return null
  const days = daysBetween(origin.date, current.date)
  let startDate = dateOf(occurrence.start, timeZone)
  let endDate = dateOf(occurrence.end, timeZone)
  if (edge === 'end') {
    endDate = endDate.add({ days })
    if (Temporal.PlainDate.compare(endDate, startDate) <= 0) endDate = startDate.add({ days: 1 })
  } else {
    startDate = startDate.add({ days })
    if (Temporal.PlainDate.compare(startDate, endDate) >= 0)
      startDate = endDate.subtract({ days: 1 })
  }
  return allDayTimes(startDate, endDate, timeZone)
}

/**
 * The range selected by dragging from `origin` to `current`, inclusive of both ends.
 * Returns `null` when the two points are in different kinds of zones.
 */
export function computeSelection(
  origin: Hit,
  current: Hit,
  options: InteractionOptions,
): EventTimes | null {
  const { timeZone, snapMinutes } = options
  if (origin.zone === 'time' || current.zone === 'time') {
    if (origin.zone !== 'time' || current.zone !== 'time') return null
    let a = zonedAtMinute(origin.date, snapDown(origin.minute, snapMinutes), timeZone)
    let b = zonedAtMinute(current.date, snapDown(current.minute, snapMinutes), timeZone)
    if (Temporal.ZonedDateTime.compare(a, b) > 0) [a, b] = [b, a]
    return { start: a, end: b.add({ minutes: snapMinutes }), allDay: false }
  }
  let a = origin.date
  let b = current.date
  if (Temporal.PlainDate.compare(a, b) > 0) [a, b] = [b, a]
  return allDayTimes(a, b.add({ days: 1 }), timeZone)
}

export function sameTimes(
  a: EventTimes | null | undefined,
  b: EventTimes | null | undefined,
): boolean {
  if (!a || !b) return a === b
  return (
    a.allDay === b.allDay &&
    a.start.epochMilliseconds === b.start.epochMilliseconds &&
    a.end.epochMilliseconds === b.end.epochMilliseconds
  )
}

/** A copy of an occurrence with other times, e.g. for a drag preview or an optimistic update. */
export function withTimes<T>(
  occurrence: EventOccurrence<T>,
  times: EventTimes,
  key = occurrence.key,
): EventOccurrence<T> {
  return Object.freeze({
    ...occurrence,
    key,
    start: times.start,
    end: times.end,
    startMs: times.start.epochMilliseconds,
    endMs: times.end.epochMilliseconds,
    allDay: times.allDay,
  })
}
