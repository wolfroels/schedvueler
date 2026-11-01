import { dayBounds, startOfWeek } from './dates'
import { formatDate } from './format'
import type { Temporal } from './temporal'
import type { EventAccessors, EventOccurrence } from './types'

export interface DayLoad<T> {
  date: Temporal.PlainDate
  /** Minutes of events on this day. Overlapping events both count. */
  minutes: number
  occurrences: EventOccurrence<T>[]
}

/** How busy each day is. All-day events count as `allDayMinutes`, by default a working day. */
export function loadPerDay<T>(
  occurrences: readonly EventOccurrence<T>[],
  days: readonly Temporal.PlainDate[],
  timeZone: string,
  allDayMinutes = 480,
): DayLoad<T>[] {
  return days.map((date) => {
    const { startMs, endMs } = dayBounds(date, timeZone)
    let minutes = 0
    const on: EventOccurrence<T>[] = []
    for (const o of occurrences) {
      if (o.startMs >= endMs || o.endMs <= startMs) continue
      on.push(o)
      minutes += o.allDay
        ? allDayMinutes
        : (Math.min(o.endMs, endMs) - Math.max(o.startMs, startMs)) / 60_000
    }
    return { date, minutes, occurrences: on }
  })
}

export type HeaderTierUnit = 'year' | 'month' | 'week' | 'day'

export interface HeaderTierCell {
  key: string
  unit: HeaderTierUnit
  /** First day of the group that is shown. */
  date: Temporal.PlainDate
  label: string
  /** Index of the first day, and the number of days covered. */
  start: number
  span: number
}

/** Groups visible days into header cells of a coarser unit. */
export function headerTiers(
  days: readonly Temporal.PlainDate[],
  unit: HeaderTierUnit,
  locale: string | undefined,
  weekStart: number,
): HeaderTierCell[] {
  const keyOf = (date: Temporal.PlainDate) => {
    if (unit === 'year') return String(date.year)
    if (unit === 'month') return `${date.year}-${date.month}`
    if (unit === 'week') return startOfWeek(date, weekStart).toString()
    return date.toString()
  }
  const labelOf = (date: Temporal.PlainDate) => {
    if (unit === 'year') return formatDate(date, locale, { year: 'numeric' })
    if (unit === 'month') return formatDate(date, locale, { month: 'long', year: 'numeric' })
    if (unit === 'week') return String(startOfWeek(date, weekStart).add({ days: 3 }).weekOfYear)
    return formatDate(date, locale, { day: 'numeric' })
  }
  const cells: HeaderTierCell[] = []
  days.forEach((date, i) => {
    const key = keyOf(date)
    const last = cells[cells.length - 1]
    if (last?.key === key) last.span++
    else cells.push({ key, unit, date, label: labelOf(date), start: i, span: 1 })
  })
  return cells
}

export interface DependencyLink<T> {
  key: string
  from: EventOccurrence<T>
  to: EventOccurrence<T>
}

/** Finish-to-start links between occurrences, from their events' `dependsOn`. */
export function dependencyLinks<T>(
  occurrences: readonly EventOccurrence<T>[],
  accessors: Pick<EventAccessors<T>, 'dependsOn'>,
): DependencyLink<T>[] {
  const byId = new Map(occurrences.map((o) => [String(o.id), o]))
  const links: DependencyLink<T>[] = []
  for (const to of occurrences) {
    for (const id of accessors.dependsOn(to.event) ?? []) {
      const from = byId.get(String(id))
      if (from) links.push({ key: `${from.key}>${to.key}`, from, to })
    }
  }
  return links
}
