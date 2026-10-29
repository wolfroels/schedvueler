import { Temporal } from './temporal'

/**
 * Result of reading a user-supplied date value:
 * - `date`: a calendar date with no time (all-day)
 * - `exact`: an exact point in time
 * - `floating`: a wall-clock time without zone, interpreted in the event's time zone
 */
export type ParsedDate =
  | { kind: 'date'; date: Temporal.PlainDate }
  | { kind: 'exact'; zdt: Temporal.ZonedDateTime }
  | { kind: 'floating'; dateTime: Temporal.PlainDateTime }

export class DateParseError extends Error {
  constructor(value: unknown) {
    super(`Cannot read date value: ${String(value)}`)
    this.name = 'DateParseError'
  }
}

const DATE_ONLY = /^[+-]?\d{4,6}-\d{2}-\d{2}$/
const OFFSET_SUFFIX = /(?:[zZ]|[+-]\d{2}(?::?\d{2}(?::?\d{2})?)?)$/

/** Temporal objects are recognised by their tag so values from another implementation also work. */
function temporalTag(value: object): string | undefined {
  const tag = Object.prototype.toString.call(value)
  return tag.startsWith('[object Temporal.') ? tag.slice(8, -1) : undefined
}

export function parseDateInput(value: unknown): ParsedDate {
  if (typeof value === 'string') return parseDateString(value.trim())
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new DateParseError(value)
    return {
      kind: 'exact',
      zdt: Temporal.Instant.fromEpochMilliseconds(value).toZonedDateTimeISO('UTC'),
    }
  }
  if (value instanceof Date) {
    const ms = value.getTime()
    if (Number.isNaN(ms)) throw new DateParseError(value)
    return {
      kind: 'exact',
      zdt: Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO('UTC'),
    }
  }
  if (value !== null && typeof value === 'object') {
    switch (temporalTag(value)) {
      case 'Temporal.PlainDate':
        return { kind: 'date', date: Temporal.PlainDate.from(String(value)) }
      case 'Temporal.PlainDateTime':
        return { kind: 'floating', dateTime: Temporal.PlainDateTime.from(String(value)) }
      case 'Temporal.ZonedDateTime':
        return { kind: 'exact', zdt: Temporal.ZonedDateTime.from(String(value)) }
      case 'Temporal.Instant':
        return {
          kind: 'exact',
          zdt: Temporal.Instant.from(String(value)).toZonedDateTimeISO('UTC'),
        }
    }
  }
  throw new DateParseError(value)
}

function parseDateString(value: string): ParsedDate {
  try {
    if (DATE_ONLY.test(value)) return { kind: 'date', date: Temporal.PlainDate.from(value) }
    if (value.includes('[')) return { kind: 'exact', zdt: Temporal.ZonedDateTime.from(value) }
    const timeIndex = value.search(/[Tt ]/)
    if (timeIndex > 0 && OFFSET_SUFFIX.test(value.slice(timeIndex + 1))) {
      return { kind: 'exact', zdt: Temporal.Instant.from(value).toZonedDateTimeISO('UTC') }
    }
    return { kind: 'floating', dateTime: Temporal.PlainDateTime.from(value) }
  } catch {
    throw new DateParseError(value)
  }
}

/** Resolves a parsed date to a zoned date-time. Dates resolve to the start of that day. */
export function resolveZoned(parsed: ParsedDate, timeZone: string): Temporal.ZonedDateTime {
  switch (parsed.kind) {
    case 'date':
      return parsed.date.toZonedDateTime({ timeZone })
    case 'exact':
      return parsed.zdt.withTimeZone(timeZone)
    case 'floating':
      return parsed.dateTime.toZonedDateTime(timeZone, { disambiguation: 'compatible' })
  }
}

/** The calendar date of a parsed value as seen in the given zone. */
export function resolveDate(parsed: ParsedDate, timeZone: string): Temporal.PlainDate {
  switch (parsed.kind) {
    case 'date':
      return parsed.date
    case 'exact':
      return parsed.zdt.withTimeZone(timeZone).toPlainDate()
    case 'floating':
      return parsed.dateTime.toPlainDate()
  }
}

export function toZoned(value: unknown, timeZone: string): Temporal.ZonedDateTime {
  return resolveZoned(parseDateInput(value), timeZone)
}

export function toPlainDate(value: unknown, timeZone: string): Temporal.PlainDate {
  return resolveDate(parseDateInput(value), timeZone)
}

/** Stable string key for a calendar day, e.g. `2026-10-29`. */
export function dayKey(
  value: Temporal.PlainDate | Temporal.ZonedDateTime | Temporal.PlainDateTime,
): string {
  return 'toPlainDate' in value ? value.toPlainDate().toString() : value.toString()
}

/** Start of the day in the given zone. Handles zones where midnight is skipped by DST. */
export function startOfDay(date: Temporal.PlainDate, timeZone: string): Temporal.ZonedDateTime {
  return date.toZonedDateTime({ timeZone })
}

/** Epoch-ms bounds of a day in the given zone. Days can be 23, 24 or 25 hours long. */
export function dayBounds(
  date: Temporal.PlainDate,
  timeZone: string,
): { startMs: number; endMs: number } {
  return {
    startMs: startOfDay(date, timeZone).epochMilliseconds,
    endMs: startOfDay(date.add({ days: 1 }), timeZone).epochMilliseconds,
  }
}

/**
 * First day of the week containing `date`.
 * @param weekStart ISO weekday the week starts on: 1 = Monday ... 7 = Sunday.
 */
export function startOfWeek(date: Temporal.PlainDate, weekStart: number): Temporal.PlainDate {
  const diff = (date.dayOfWeek - weekStart + 7) % 7
  return diff === 0 ? date : date.subtract({ days: diff })
}

export function startOfMonth(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.with({ day: 1 })
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: Temporal.PlainDate, b: Temporal.PlainDate): number {
  return a.until(b, { largestUnit: 'days' }).days
}

/** Every date in the half-open range `[start, end)`. */
export function eachDay(start: Temporal.PlainDate, end: Temporal.PlainDate): Temporal.PlainDate[] {
  const days: Temporal.PlainDate[] = []
  for (let d = start; Temporal.PlainDate.compare(d, end) < 0; d = d.add({ days: 1 })) days.push(d)
  return days
}

/** Wall-clock minutes since midnight. Seconds count as fractions of a minute. */
export function minutesIntoDay(value: Temporal.ZonedDateTime | Temporal.PlainDateTime): number {
  return value.hour * 60 + value.minute + value.second / 60
}

export function isSameDay(a: Temporal.PlainDate, b: Temporal.PlainDate): boolean {
  return Temporal.PlainDate.compare(a, b) === 0
}

export function today(timeZone: string): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(timeZone)
}

export function now(timeZone: string): Temporal.ZonedDateTime {
  return Temporal.Now.zonedDateTimeISO(timeZone)
}

/** The runtime's default time zone. */
export function systemTimeZone(): string {
  return Temporal.Now.timeZoneId()
}
