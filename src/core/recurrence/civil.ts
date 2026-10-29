// Integer calendar arithmetic (proleptic Gregorian) used in the recurrence hot loop.
// Days are counted from 1970-01-01 ("epoch days"), which avoids allocating Temporal objects
// for every candidate date.

export interface Civil {
  year: number
  month: number
  day: number
}

/** Days since 1970-01-01. Algorithm from Howard Hinnant's `days_from_civil`. */
export function epochDay(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** Inverse of {@link epochDay}. */
export function civil(days: number): Civil {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  return { year: era * 400 + yoe + (month <= 2 ? 1 : 0), month, day }
}

/** ISO weekday of an epoch day: 1 = Monday ... 7 = Sunday. 1970-01-01 was a Thursday. */
export function isoWeekday(days: number): number {
  return ((((days + 3) % 7) + 7) % 7) + 1
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : MONTH_DAYS[month - 1]!
}

/** Epoch day of the first day of the week containing `days`, for weeks starting on `wkst`. */
export function weekStartDay(days: number, wkst: number): number {
  return days - ((isoWeekday(days) - wkst + 7) % 7)
}

/**
 * RFC 5545 week number: week 1 is the first week with at least four days in the year, and weeks
 * start on `wkst`. Returns the year the week belongs to, which can differ from the date's year.
 */
export function weekNumber(days: number, wkst: number): { year: number; week: number } {
  const start = weekStartDay(days, wkst)
  const year = civil(start + 3).year
  const firstWeekStart = weekStartDay(epochDay(year, 1, 4), wkst)
  return { year, week: (start - firstWeekStart) / 7 + 1 }
}

export function weeksInYear(year: number, wkst: number): number {
  return weekNumber(epochDay(year, 12, 28), wkst).week
}
