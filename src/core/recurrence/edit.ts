import type { Temporal } from '../temporal'
import {
  countOccurrencesBefore,
  isAllDaySeries,
  type RecurrenceSeries,
  type RecurrenceStart,
} from './expand'
import type { RecurrenceRule } from './rule'

/** Which occurrences a change to a recurring event applies to. */
export type RecurrenceEditScope = 'this' | 'following' | 'all'

function toPlain(value: RecurrenceStart): Temporal.PlainDate | Temporal.PlainDateTime {
  return 'timeZoneId' in value ? value.toPlainDateTime() : value
}

/**
 * Ends a series just before `occurrence`, for "this and following" edits.
 * Keeps COUNT-based rules count-based and UNTIL-based rules until-based.
 * Returns `null` when no occurrence would remain (the edit starts at the first occurrence).
 */
export function truncateRuleBefore(
  series: RecurrenceSeries,
  occurrence: RecurrenceStart,
): RecurrenceRule | null {
  const remaining = countOccurrencesBefore(series, toPlain(occurrence))
  if (remaining === 0) return null
  const { rule } = series
  if (rule.count !== undefined) return { ...rule, count: remaining }
  if (isAllDaySeries(series)) {
    const date = 'timeZoneId' in occurrence ? occurrence.toPlainDate() : occurrence
    return { ...rule, until: { kind: 'date', date: date.subtract({ days: 1 }) } }
  }
  // RFC 5545 requires a UTC UNTIL when DTSTART has a time zone.
  const zoned = occurrence as Temporal.ZonedDateTime
  return {
    ...rule,
    until: { kind: 'exact', zdt: zoned.subtract({ seconds: 1 }).withTimeZone('UTC') },
  }
}

/**
 * Serialises an occurrence start for storage as an `exdates` entry or a `recurrenceId`:
 * `2026-10-29` for all-day series, `2026-10-29T09:00:00+01:00[Europe/Brussels]` otherwise.
 */
export function formatRecurrenceId(occurrence: RecurrenceStart): string {
  return occurrence.toString()
}
