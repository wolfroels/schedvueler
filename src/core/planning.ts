import { Temporal } from './temporal'
import {
  fitsBusinessHours,
  findBlocked,
  type BusinessHours,
  type ResolvedBlockedTime,
} from './availability'
import { daysBetween, minutesIntoDay, zonedAtMinute } from './dates'
import type { EventOccurrence, ResourceId } from './types'

export interface FreeSlotOptions {
  /** Length in minutes. */
  durationMinutes: number
  from: Temporal.ZonedDateTime
  to: Temporal.ZonedDateTime
  /** Everyone has to be free. Without any, every event counts. */
  resourceIds?: readonly ResourceId[]
  /** Only inside these hours; per resource when a function. */
  businessHours?:
    BusinessHours | ((resourceId: ResourceId | undefined) => BusinessHours | undefined)
  blocked?: readonly ResolvedBlockedTime[]
  /** Minutes between candidates. Default 15. */
  stepMinutes?: number
  /** At most this many. Default 10. */
  limit?: number
}

export interface FreeSlot {
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
}

/** Times of a given length when all the given resources are free. */
export function findFreeSlots<T>(
  occurrences: readonly EventOccurrence<T>[],
  options: FreeSlotOptions,
): FreeSlot[] {
  const { durationMinutes, from, to, resourceIds = [], blocked = [] } = options
  const step = options.stepMinutes ?? 15
  const limit = options.limit ?? 10
  const lengthMs = durationMinutes * 60_000
  const relevant = occurrences
    .filter(
      (o) =>
        !resourceIds.length ||
        !o.resourceIds.length ||
        o.resourceIds.some((id) => resourceIds.includes(id)),
    )
    .sort((a, b) => a.startMs - b.startMs)
  const hours = (id: ResourceId | undefined) =>
    typeof options.businessHours === 'function' ? options.businessHours(id) : options.businessHours
  const targets: readonly (ResourceId | undefined)[] = resourceIds.length
    ? resourceIds
    : [undefined]

  const out: FreeSlot[] = []
  // Candidates line up with the step, counted from midnight.
  const startOfDay = from.toPlainDate().toZonedDateTime(from.timeZoneId)
  const offset = Math.ceil(from.since(startOfDay).total('minutes') / step) * step
  let start = startOfDay.add({ minutes: offset })
  let firstRelevant = 0
  while (out.length < limit && Temporal.ZonedDateTime.compare(start, to) < 0) {
    const end = start.add({ minutes: durationMinutes })
    const startMs = start.epochMilliseconds
    const endMs = startMs + lengthMs
    if (end.epochMilliseconds > to.epochMilliseconds) break
    while (firstRelevant < relevant.length && relevant[firstRelevant]!.endMs <= startMs)
      firstRelevant++
    let free = true
    for (let i = firstRelevant; i < relevant.length && relevant[i]!.startMs < endMs; i++) {
      if (relevant[i]!.endMs > startMs) {
        free = false
        break
      }
    }
    free &&= !findBlocked(blocked, startMs, endMs, resourceIds)
    free &&= targets.every((id) => {
      const h = hours(id)
      return !h || fitsBusinessHours(start, end, h)
    })
    if (free) out.push({ start, end })
    start = start.add({ minutes: step })
  }
  return out
}

/** The first free time of a given length. */
export function nextFreeSlot<T>(
  occurrences: readonly EventOccurrence<T>[],
  options: Omit<FreeSlotOptions, 'limit'>,
): FreeSlot | undefined {
  return findFreeSlots(occurrences, { ...options, limit: 1 })[0]
}

export interface Conflict<T> {
  /** The resource it happens on; `undefined` for events without resources. */
  resourceId: ResourceId | undefined
  occurrences: EventOccurrence<T>[]
}

/** Groups of events that overlap, per resource. A group holds everything connected by overlaps. */
export function findConflicts<T>(occurrences: readonly EventOccurrence<T>[]): Conflict<T>[] {
  const lists = new Map<ResourceId | undefined, EventOccurrence<T>[]>()
  for (const occ of occurrences) {
    for (const id of occ.resourceIds.length ? occ.resourceIds : [undefined]) {
      const list = lists.get(id)
      if (list) list.push(occ)
      else lists.set(id, [occ])
    }
  }
  const conflicts: Conflict<T>[] = []
  for (const [resourceId, list] of lists) {
    const sorted = list.filter((o) => !o.allDay).sort((a, b) => a.startMs - b.startMs)
    let group: EventOccurrence<T>[] = []
    let groupEnd = -Infinity
    const close = () => {
      if (group.length > 1) conflicts.push({ resourceId, occurrences: group })
    }
    for (const occ of sorted) {
      if (occ.startMs >= groupEnd) {
        close()
        group = []
        groupEnd = -Infinity
      }
      group.push(occ)
      groupEnd = Math.max(groupEnd, occ.endMs)
    }
    close()
  }
  return conflicts
}

/** Working hours in a time zone. */
export interface ZoneHours {
  timeZone: string
  /** "HH:mm". */
  start: string
  end: string
}

const clock = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return h! * 60 + (m ?? 0)
}

/** The minutes of a date, in `timeZone`, when it is working hours in every given zone. */
export function overlapHours(
  date: Temporal.PlainDate,
  zones: readonly ZoneHours[],
  timeZone: string,
): { start: number; end: number }[] {
  const minuteOf = (moment: Temporal.ZonedDateTime) => {
    const local = moment.withTimeZone(timeZone)
    return daysBetween(date, local.toPlainDate()) * 1440 + minutesIntoDay(local)
  }
  let ranges = [{ start: 0, end: 1440 }]
  for (const zone of zones) {
    // Working hours on the day before, of and after can all fall on this date elsewhere.
    const open = [-1, 0, 1].map((shift) => {
      const day = date.add({ days: shift })
      return {
        start: minuteOf(zonedAtMinute(day, clock(zone.start), zone.timeZone)),
        end: minuteOf(zonedAtMinute(day, clock(zone.end), zone.timeZone)),
      }
    })
    ranges = ranges.flatMap((r) =>
      open.flatMap((o) => {
        const start = Math.max(r.start, o.start)
        const end = Math.min(r.end, o.end)
        return end > start ? [{ start, end }] : []
      }),
    )
  }
  return ranges.sort((a, b) => a.start - b.start)
}

/** Stretches without events in `[from, to)`, at least `minMinutes` long, on slot boundaries. */
export function emptyStretches(
  busy: readonly { start: number; end: number }[],
  from: number,
  to: number,
  minMinutes: number,
  slotMinutes: number,
): { start: number; end: number }[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  const push = (start: number, end: number) => {
    const a = Math.ceil((start - from) / slotMinutes) * slotMinutes + from
    const b = Math.floor((end - from) / slotMinutes) * slotMinutes + from
    if (b - a >= minMinutes) out.push({ start: a, end: b })
  }
  let cursor = from
  for (const b of sorted) {
    if (b.start > cursor) push(cursor, Math.min(b.start, to))
    cursor = Math.max(cursor, b.end)
    if (cursor >= to) break
  }
  if (cursor < to) push(cursor, to)
  return out
}

export interface ScopeOption {
  scope: 'this' | 'following' | 'all'
  label: string
  /** What it changes. */
  description: string
}

export interface ScopeWords {
  this: [string, string]
  following: [string, string]
  all: [string, string]
}

export const defaultScopeWords: ScopeWords = {
  this: ['This event', 'Only this occurrence changes.'],
  following: ['This and following events', 'This occurrence and all later ones change.'],
  all: ['All events', 'Every occurrence in the series changes.'],
}

/** The choices to offer for a change to a recurring event. */
export function recurrenceScopeOptions(
  occurrence: Pick<EventOccurrence<unknown>, 'recurring' | 'isException'>,
  words: ScopeWords = defaultScopeWords,
): ScopeOption[] {
  if (!occurrence.recurring && !occurrence.isException) return []
  return (['this', 'following', 'all'] as const).map((scope) => ({
    scope,
    label: words[scope][0],
    description: words[scope][1],
  }))
}
