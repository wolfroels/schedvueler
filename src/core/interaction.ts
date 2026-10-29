import { Temporal } from './temporal'
import { daysBetween, zonedAtMinute } from './dates'
import { moveResourceIds, sameResourceIds } from './resources'
import type { EventOccurrence, ResourceId } from './types'

/**
 * What the pointer is over, as reported by a view:
 * - `time`: a time-grid column, at a wall-clock minute of that day
 * - `all-day`: a day in the all-day row
 * - `month`: a day cell in a month-style grid
 * - `timeline`: a point on a horizontal time axis; events stay all-day or timed there
 *
 * `resourceId` is set when the spot belongs to a resource (a resource column or timeline row).
 */
export type Hit =
  | { zone: 'time'; date: Temporal.PlainDate; minute: number; resourceId?: ResourceId }
  | { zone: 'all-day'; date: Temporal.PlainDate; resourceId?: ResourceId }
  | { zone: 'month'; date: Temporal.PlainDate; resourceId?: ResourceId }
  | { zone: 'timeline'; date: Temporal.PlainDate; minute: number; resourceId?: ResourceId }

export interface EventTimes {
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  /** Resources after the change. For a selection: the resource it was made on. */
  resourceIds?: readonly ResourceId[]
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
const isTimeAxis = (hit: Hit) => hit.zone === 'time' || hit.zone === 'timeline'

function shiftWallClock(
  value: Temporal.ZonedDateTime,
  days: number,
  minutes: number,
  timeZone: string,
): Temporal.ZonedDateTime {
  // One duration field: Temporal rejects mixed signs such as { days: -1, minutes: 60 }. A plain
  // date-time has no DST, so a day is always 1440 minutes here.
  return value
    .withTimeZone(timeZone)
    .toPlainDateTime()
    .add({ minutes: days * 1440 + minutes })
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

/** Wall-clock minutes from one point on a time axis to another. */
function minutesBetween(
  a: { date: Temporal.PlainDate; minute: number },
  b: { date: Temporal.PlainDate; minute: number },
): number {
  return daysBetween(a.date, b.date) * 1440 + b.minute - a.minute
}

function shiftAllDay(
  occurrence: EventOccurrence<unknown>,
  days: number,
  timeZone: string,
): EventTimes {
  const startDate = dateOf(occurrence.start, timeZone).add({ days })
  const span = daysBetween(dateOf(occurrence.start, timeZone), dateOf(occurrence.end, timeZone))
  return allDayTimes(startDate, startDate.add({ days: Math.max(span, 1) }), timeZone)
}

/**
 * New times for an occurrence dragged from `origin` to `current`.
 * - Within the time grid the start moves by the snapped distance, keeping odd start minutes.
 * - Dropping a timed event on the all-day row makes it a one-day all-day event, and the reverse
 *   gives it `defaultDurationMinutes` starting at the snapped drop time.
 * - In a month grid events move by whole days and keep their time of day.
 * - On a timeline, timed events move by the snapped distance and all-day events by whole days.
 * - Moving to another resource replaces the origin's resource with that one.
 */
export function computeMove(
  occurrence: EventOccurrence<unknown>,
  origin: Hit,
  current: Hit,
  options: InteractionOptions,
): EventTimes {
  return {
    ...moveTimes(occurrence, origin, current, options),
    resourceIds: moveResourceIds(occurrence.resourceIds, origin.resourceId, current.resourceId),
  }
}

function moveTimes(
  occurrence: EventOccurrence<unknown>,
  origin: Hit,
  current: Hit,
  options: InteractionOptions,
): EventTimes {
  const { timeZone, snapMinutes } = options
  const durationMs = occurrence.endMs - occurrence.startMs

  if (current.zone === 'timeline') {
    const delta = origin.zone === 'timeline' ? minutesBetween(origin, current) : 0
    if (occurrence.allDay) return shiftAllDay(occurrence, Math.round(delta / 1440), timeZone)
    const start = shiftWallClock(occurrence.start, 0, snapDelta(delta, snapMinutes), timeZone)
    return { start, end: start.add({ milliseconds: durationMs }), allDay: false }
  }

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
  if (occurrence.allDay) return shiftAllDay(occurrence, days, timeZone)
  if (current.zone === 'all-day') {
    return allDayTimes(current.date, current.date.add({ days: 1 }), timeZone)
  }
  // Timed event in a month grid: same time of day, other date.
  const start = shiftWallClock(occurrence.start, days, 0, timeZone)
  return { start, end: start.add({ milliseconds: durationMs }), allDay: false }
}

/**
 * New times for an occurrence whose `edge` is dragged from `origin` to `current`.
 * Timed events resize in snapped minutes on the time grid or a timeline; all-day events in whole
 * days. The event never gets shorter than one snap step or one day. Returns `null` when the
 * pointer is over a zone that cannot resize this occurrence.
 */
export function computeResize(
  occurrence: EventOccurrence<unknown>,
  edge: ResizeEdge,
  origin: Hit,
  current: Hit,
  options: InteractionOptions,
): EventTimes | null {
  const { timeZone, snapMinutes } = options
  const timeline = origin.zone === 'timeline' && current.zone === 'timeline'
  const resourceIds = occurrence.resourceIds

  if (!occurrence.allDay) {
    let delta: number
    if (timeline) delta = snapDelta(minutesBetween(origin, current), snapMinutes)
    else if (origin.zone === 'time' && current.zone === 'time')
      delta =
        daysBetween(origin.date, current.date) * 1440 +
        snapDelta(current.minute - origin.minute, snapMinutes)
    else return null
    const minMs = snapMinutes * 60_000
    if (edge === 'end') {
      let end = shiftWallClock(occurrence.end, 0, delta, timeZone)
      if (end.epochMilliseconds - occurrence.startMs < minMs)
        end = occurrence.start.add({ minutes: snapMinutes })
      return { start: occurrence.start, end, allDay: false, resourceIds }
    }
    let start = shiftWallClock(occurrence.start, 0, delta, timeZone)
    if (occurrence.endMs - start.epochMilliseconds < minMs)
      start = occurrence.end.subtract({ minutes: snapMinutes })
    return { start, end: occurrence.end, allDay: false, resourceIds }
  }

  let days: number
  if (timeline) days = Math.round(minutesBetween(origin, current) / 1440)
  else if (isTimeAxis(origin) || isTimeAxis(current)) return null
  else days = daysBetween(origin.date, current.date)
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
  return { ...allDayTimes(startDate, endDate, timeZone), resourceIds }
}

/**
 * The range selected by dragging from `origin` to `current`, inclusive of both ends.
 * On a timeline that snaps to whole days (or more) the selection is all-day.
 * It belongs to the origin's resource. Returns `null` when the two points are in different
 * kinds of zones.
 */
export function computeSelection(
  origin: Hit,
  current: Hit,
  options: InteractionOptions,
): EventTimes | null {
  const { timeZone, snapMinutes } = options
  const resourceIds = origin.resourceId !== undefined ? [origin.resourceId] : undefined
  if (isTimeAxis(origin) || isTimeAxis(current)) {
    if (origin.zone !== current.zone) return null
    if (origin.zone === 'timeline' && snapMinutes >= 1440) {
      let a = origin.date
      let b = current.date
      if (Temporal.PlainDate.compare(a, b) > 0) [a, b] = [b, a]
      return { ...allDayTimes(a, b.add({ days: 1 }), timeZone), resourceIds }
    }
    const o = origin as { date: Temporal.PlainDate; minute: number }
    const c = current as { date: Temporal.PlainDate; minute: number }
    let a = zonedAtMinute(o.date, snapDown(o.minute, snapMinutes), timeZone)
    let b = zonedAtMinute(c.date, snapDown(c.minute, snapMinutes), timeZone)
    if (Temporal.ZonedDateTime.compare(a, b) > 0) [a, b] = [b, a]
    return { start: a, end: b.add({ minutes: snapMinutes }), allDay: false, resourceIds }
  }
  let a = origin.date
  let b = current.date
  if (Temporal.PlainDate.compare(a, b) > 0) [a, b] = [b, a]
  return { ...allDayTimes(a, b.add({ days: 1 }), timeZone), resourceIds }
}

export function sameTimes(
  a: EventTimes | null | undefined,
  b: EventTimes | null | undefined,
): boolean {
  if (!a || !b) return a === b
  return (
    a.allDay === b.allDay &&
    a.start.epochMilliseconds === b.start.epochMilliseconds &&
    a.end.epochMilliseconds === b.end.epochMilliseconds &&
    // Resources only count when both sides carry them.
    (!a.resourceIds || !b.resourceIds || sameResourceIds(a.resourceIds, b.resourceIds))
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
    resourceIds: times.resourceIds ?? occurrence.resourceIds,
  })
}

/** What is known about an event dragged in from outside the scheduler. */
export interface DropTemplate {
  /** `true`: lands as an all-day event outside the time grid. `false`: always timed. */
  allDay?: boolean
  /** Length of the timed event in minutes. Defaults to `defaultDurationMinutes`. */
  durationMinutes?: number
  /** Length of the all-day event in days. Default 1. */
  days?: number
  /** Start minute of a timed event dropped on a day (month cell, all-day row). Default 540 (09:00). */
  startMinute?: number
}

/**
 * Times for an event dropped from outside at `hit`.
 * - In the time grid (and on a timeline with sub-day slots) it starts at the snapped drop time.
 * - On a day (month cell, all-day row, day-slot timeline) it is all-day, unless the template says
 *   `allDay: false`, in which case it starts at `startMinute` that day.
 * - It belongs to the resource under the pointer, if any.
 */
export function computeDrop(
  hit: Hit,
  template: DropTemplate,
  options: InteractionOptions,
): EventTimes {
  const { timeZone, snapMinutes } = options
  const resourceIds = hit.resourceId !== undefined ? [hit.resourceId] : []
  const duration = template.durationMinutes ?? options.defaultDurationMinutes
  // Pointer positions snap; the template's own start time is used as given.
  const timedAt = (date: Temporal.PlainDate, minute: number, snap = true): EventTimes => {
    const start = zonedAtMinute(date, snap ? snapDown(minute, snapMinutes) : minute, timeZone)
    return { start, end: start.add({ minutes: duration }), allDay: false, resourceIds }
  }
  const onDay = (date: Temporal.PlainDate): EventTimes =>
    template.allDay === false
      ? timedAt(date, template.startMinute ?? 540, false)
      : {
          ...allDayTimes(date, date.add({ days: Math.max(1, template.days ?? 1) }), timeZone),
          resourceIds,
        }

  if (hit.zone === 'time') return timedAt(hit.date, hit.minute)
  if (hit.zone === 'timeline' && snapMinutes < 1440 && template.allDay !== true)
    return timedAt(hit.date, hit.minute)
  return onDay(hit.date)
}
