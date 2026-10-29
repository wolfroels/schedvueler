import { Temporal } from '../temporal'
import type { ParsedDate } from '../dates'
import type { TimeWindow } from '../types'
import { civil, epochDay } from './civil'
import { iterateRule, splitLocalSeconds, toLocalSeconds, type LocalSeconds } from './iterate'
import type { RecurrenceRule } from './rule'

/** A recurring series in its own time zone. */
export interface RecurrenceSeries {
  rule: RecurrenceRule
  /** DTSTART. A `PlainDate` for all-day series, otherwise wall-clock time in `timeZone`. */
  start: Temporal.PlainDate | Temporal.PlainDateTime
  /** Zone the rule is evaluated in. Daily 09:00 stays 09:00 local across DST changes. */
  timeZone: string
  exdates?: readonly ParsedDate[]
  rdates?: readonly ParsedDate[]
}

/** One generated instance: its original start in the series' own terms. */
export type RecurrenceStart = Temporal.PlainDate | Temporal.ZonedDateTime

export interface ExpandOptions {
  /** Zone used to place all-day occurrences on the timeline. */
  displayTimeZone: string
  /** Length of timed occurrences. */
  durationMs?: number
  /** Length of all-day occurrences in days. Default 1. */
  durationDays?: number
  /** Safety cap on returned occurrences. Default 10 000. */
  limit?: number
}

export function isAllDaySeries(series: RecurrenceSeries): boolean {
  return !('hour' in series.start)
}

function plainToLocal(value: Temporal.PlainDate | Temporal.PlainDateTime): LocalSeconds {
  const days = epochDay(value.year, value.month, value.day)
  if (!('hour' in value)) return toLocalSeconds(days, 0)
  return toLocalSeconds(days, value.hour * 3600 + value.minute * 60 + value.second)
}

function localToPlainDateTime(value: LocalSeconds): Temporal.PlainDateTime {
  const { days, secondOfDay } = splitLocalSeconds(value)
  const { year, month, day } = civil(days)
  return new Temporal.PlainDateTime(
    year,
    month,
    day,
    Math.floor(secondOfDay / 3600),
    Math.floor((secondOfDay % 3600) / 60),
    secondOfDay % 60,
  )
}

function localToPlainDate(value: LocalSeconds): Temporal.PlainDate {
  const { year, month, day } = civil(splitLocalSeconds(value).days)
  return new Temporal.PlainDate(year, month, day)
}

/** Converts a parsed date into the series' local seconds. */
function parsedToLocal(value: ParsedDate, timeZone: string): LocalSeconds {
  switch (value.kind) {
    case 'date':
      return plainToLocal(value.date)
    case 'floating':
      return plainToLocal(value.dateTime)
    case 'exact':
      return plainToLocal(value.zdt.withTimeZone(timeZone).toPlainDateTime())
  }
}

function untilToLocal(
  rule: RecurrenceRule,
  series: RecurrenceSeries,
  allDay: boolean,
): LocalSeconds | undefined {
  const until = rule.until
  if (!until) return undefined
  // A date-only UNTIL includes the whole day.
  if (until.kind === 'date') return plainToLocal(until.date) + (allDay ? 0 : 86399)
  const local = parsedToLocal(until, series.timeZone)
  return allDay ? Math.floor(local / 86400) * 86400 : local
}

interface Exclusions {
  exact: Set<LocalSeconds>
  days: Set<number>
}

function buildExclusions(series: RecurrenceSeries, allDay: boolean): Exclusions {
  const exact = new Set<LocalSeconds>()
  const days = new Set<number>()
  for (const ex of series.exdates ?? []) {
    const local = parsedToLocal(ex, series.timeZone)
    // A date-only EXDATE removes every occurrence on that day.
    if (ex.kind === 'date' || allDay) days.add(Math.floor(local / 86400))
    else exact.add(local)
  }
  return { exact, days }
}

function isExcluded(value: LocalSeconds, ex: Exclusions): boolean {
  return ex.exact.has(value) || ex.days.has(Math.floor(value / 86400))
}

/** Converts local seconds of a series into an epoch-ms start and the public start value. */
function materialize(
  value: LocalSeconds,
  series: RecurrenceSeries,
  allDay: boolean,
  displayTimeZone: string,
): { startMs: number; start: RecurrenceStart } {
  if (allDay) {
    const date = localToPlainDate(value)
    return {
      startMs: date.toZonedDateTime({ timeZone: displayTimeZone }).epochMilliseconds,
      start: date,
    }
  }
  const zdt = localToPlainDateTime(value).toZonedDateTime(series.timeZone, {
    disambiguation: 'compatible',
  })
  return { startMs: zdt.epochMilliseconds, start: zdt }
}

/**
 * Occurrences of a series that overlap `window`, in ascending order.
 * Only the visible window is expanded; rules without COUNT skip straight to it.
 */
export function expandSeries(
  series: RecurrenceSeries,
  window: TimeWindow,
  options: ExpandOptions,
): RecurrenceStart[] {
  const allDay = isAllDaySeries(series)
  const durationMs = options.durationMs ?? 0
  const durationDays = options.durationDays ?? 1
  const limit = options.limit ?? 10_000
  const { displayTimeZone } = options
  const exclusions = buildExclusions(series, allDay)
  const start = plainToLocal(series.start)

  // Earliest local start that could still overlap the window, with a day of slack for zone offsets.
  const windowStartLocal = plainToLocal(
    Temporal.Instant.fromEpochMilliseconds(window.startMs)
      .toZonedDateTimeISO(allDay ? displayTimeZone : series.timeZone)
      .toPlainDateTime(),
  )
  const fastForwardTo =
    windowStartLocal - (allDay ? durationDays * 86400 : Math.ceil(durationMs / 1000)) - 86400

  const overlaps = (startMs: number, value: LocalSeconds): boolean => {
    let endMs: number
    if (allDay) {
      endMs = localToPlainDate(value)
        .add({ days: durationDays })
        .toZonedDateTime({ timeZone: displayTimeZone }).epochMilliseconds
    } else {
      endMs = startMs + durationMs
    }
    return endMs > window.startMs || (endMs === startMs && startMs >= window.startMs)
  }

  const results = new Map<LocalSeconds, RecurrenceStart>()
  const iterator = iterateRule(series.rule, {
    start,
    allDay,
    until: untilToLocal(series.rule, series, allDay),
    fastForwardTo,
  })
  for (const value of iterator) {
    if (value < fastForwardTo) continue
    const { startMs, start: occurrence } = materialize(value, series, allDay, displayTimeZone)
    if (startMs >= window.endMs) break
    if (isExcluded(value, exclusions) || !overlaps(startMs, value)) continue
    results.set(value, occurrence)
    if (results.size >= limit) break
  }

  for (const rdate of series.rdates ?? []) {
    const value = parsedToLocal(rdate, series.timeZone)
    if (results.has(value) || isExcluded(value, exclusions)) continue
    const { startMs, start: occurrence } = materialize(value, series, allDay, displayTimeZone)
    if (startMs < window.endMs && overlaps(startMs, value)) results.set(value, occurrence)
  }

  return [...results.entries()].sort((a, b) => a[0] - b[0]).map(([, occurrence]) => occurrence)
}

/**
 * The first `limit` occurrences of a series, ignoring windows. Exdates and rdates are applied.
 * Useful for finite series and previews ("next 5 occurrences").
 */
export function takeOccurrences(series: RecurrenceSeries, limit: number): RecurrenceStart[] {
  const allDay = isAllDaySeries(series)
  const exclusions = buildExclusions(series, allDay)
  const values = new Set<LocalSeconds>()
  const iterator = iterateRule(series.rule, {
    start: plainToLocal(series.start),
    allDay,
    until: untilToLocal(series.rule, series, allDay),
  })
  for (const value of iterator) {
    if (values.size >= limit) break
    if (!isExcluded(value, exclusions)) values.add(value)
  }
  for (const rdate of series.rdates ?? []) {
    const value = parsedToLocal(rdate, series.timeZone)
    if (!isExcluded(value, exclusions)) values.add(value)
  }
  return [...values]
    .sort((a, b) => a - b)
    .slice(0, limit)
    .map((value) =>
      allDay
        ? localToPlainDate(value)
        : localToPlainDateTime(value).toZonedDateTime(series.timeZone, {
            disambiguation: 'compatible',
          }),
    )
}

/** Counts rule occurrences (not rdates) that start strictly before `before`. */
export function countOccurrencesBefore(
  series: RecurrenceSeries,
  before: Temporal.PlainDate | Temporal.PlainDateTime,
): number {
  const allDay = isAllDaySeries(series)
  const limit = plainToLocal(before)
  let n = 0
  for (const value of iterateRule(series.rule, {
    start: plainToLocal(series.start),
    allDay,
    until: untilToLocal(series.rule, series, allDay),
  })) {
    if (value >= limit) break
    n++
  }
  return n
}
