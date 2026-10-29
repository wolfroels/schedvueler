import { parseDateInput, type ParsedDate } from './dates'
import type { Temporal } from './temporal'

/**
 * Converts between the date values an app works with and the scheduler's internal Temporal values.
 * Internally the scheduler always uses Temporal; the adapter only decides what comes in and what is
 * handed back in emits.
 */
export interface DateAdapter<TOut = Temporal.ZonedDateTime> {
  /** Reads an app value (string, Date, a dayjs object, ...). */
  parse(value: unknown): ParsedDate
  /** Converts a scheduler date into the app's representation. */
  output(value: Temporal.ZonedDateTime, allDay: boolean): TOut
}

/** Hands back Temporal.ZonedDateTime values. */
export const temporalAdapter: DateAdapter<Temporal.ZonedDateTime> = {
  parse: parseDateInput,
  output: (value) => value,
}

/** Hands back native `Date` objects. */
export const nativeDateAdapter: DateAdapter<Date> = {
  parse: parseDateInput,
  output: (value) => new Date(value.epochMilliseconds),
}

/**
 * Hands back ISO strings: `2026-10-29` for all-day values,
 * `2026-10-29T09:00:00+01:00` for timed values.
 */
export const isoAdapter: DateAdapter<string> = {
  parse: parseDateInput,
  output: (value, allDay) =>
    allDay ? value.toPlainDate().toString() : value.toString({ timeZoneName: 'never' }),
}
