import type { Temporal } from './temporal'
import { minutesIntoDay } from './dates'

// Formatting goes through Intl with timeZone UTC on synthetic UTC dates, so a PlainDate or a
// wall-clock minute is printed exactly as given, whatever the runtime's own zone is.

const cache = new Map<string, Intl.DateTimeFormat>()

function formatter(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`
  let fmt = cache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
    cache.set(key, fmt)
  }
  return fmt
}

function utc(date: Temporal.PlainDate, minutes = 0): Date {
  const d = new Date(Date.UTC(2000, 0, 1, 0, minutes))
  d.setUTCFullYear(date.year, date.month - 1, date.day)
  return d
}

export function formatDate(
  date: Temporal.PlainDate,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return formatter(locale, options).format(utc(date))
}

/** Formats an inclusive date range, e.g. "26 Oct – 1 Nov 2026". */
export function formatDateRange(
  start: Temporal.PlainDate,
  endInclusive: Temporal.PlainDate,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return formatter(locale, options).formatRange(utc(start), utc(endInclusive))
}

export interface TimeFormatOptions {
  /** Force 12- or 24-hour clock. Defaults to the locale's preference. */
  hour12?: boolean
  /** Leave out ":00" on whole hours, e.g. "9 AM" instead of "9:00 AM" (12-hour clocks only). */
  compact?: boolean
}

/** Formats wall-clock minutes since midnight, e.g. 570 -> "09:30". */
export function formatTimeOfDay(
  minutes: number,
  locale: string | undefined,
  options: TimeFormatOptions = {},
): string {
  const whole = Math.round(minutes) % 1440
  const date = new Date(Date.UTC(2000, 0, 1, 0, whole))
  const clock: Intl.DateTimeFormatOptions =
    options.hour12 === undefined ? {} : { hour12: options.hour12 }
  const twelveHour = formatter(locale, { hour: 'numeric', ...clock }).resolvedOptions().hour12
  if (twelveHour) {
    if (options.compact && whole % 60 === 0) {
      return formatter(locale, { hour: 'numeric', hour12: true }).format(date)
    }
    return formatter(locale, { hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
  }
  // 24-hour clocks read best with two-digit hours: "09:30".
  return formatter(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

/** Formats the wall-clock time of a zoned date-time. */
export function formatTime(
  value: Temporal.ZonedDateTime,
  locale: string | undefined,
  options: TimeFormatOptions = {},
): string {
  return formatTimeOfDay(minutesIntoDay(value), locale, options)
}

/** Formats a time range, e.g. "09:00 – 10:30". */
export function formatTimeRange(
  start: Temporal.ZonedDateTime,
  end: Temporal.ZonedDateTime,
  locale: string | undefined,
  options: TimeFormatOptions = {},
): string {
  return `${formatTime(start, locale, options)} – ${formatTime(end, locale, options)}`
}

interface WeekInfoLocale extends Intl.Locale {
  getWeekInfo?: () => { firstDay: number }
  weekInfo?: { firstDay: number }
}

/** First day of the week for a locale as an ISO weekday (1 = Monday). Falls back to Monday. */
export function weekStartForLocale(locale: string | undefined): number {
  try {
    const loc = new Intl.Locale(
      locale ?? new Intl.DateTimeFormat().resolvedOptions().locale,
    ) as WeekInfoLocale
    const info = loc.getWeekInfo?.() ?? loc.weekInfo
    return info?.firstDay ?? 1
  } catch {
    return 1
  }
}
