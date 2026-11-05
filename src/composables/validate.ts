const warned = new Set<string>()

/** Warns about a bad option once, instead of on every render. */
export function warnOnce(message: string): void {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(`[schedvueler] ${message}`)
}

export function validTimeZone(zone: string, fallback: () => string): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return zone
  } catch {
    warnOnce(`Unknown time zone "${zone}"; using the default.`)
    return fallback()
  }
}

export function validLocale(locale: string, fallback: () => string): string {
  try {
    Intl.getCanonicalLocales(locale)
    return locale
  } catch {
    warnOnce(`Invalid locale "${locale}"; using the default.`)
    return fallback()
  }
}

/** A positive number of minutes, or the fallback. */
export function validMinutes(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (Number.isFinite(value) && value > 0) return value
  warnOnce(`${name} must be a positive number of minutes, got ${value}; using ${fallback}.`)
  return fallback
}

export function validWeekStart(value: number | undefined): number | undefined {
  if (value === undefined || (Number.isInteger(value) && value >= 1 && value <= 7)) return value
  warnOnce(`weekStart must be an ISO weekday from 1 to 7, got ${value}; using the locale's.`)
  return undefined
}

/** Visible hours in minutes; the whole day when the end is not after the start. */
export function visibleHours(start: number, end: number): [number, number] {
  if (end - start > 1440) {
    warnOnce(`A day can show at most 24 hours; dayEndTime is cut to 24 hours after dayStartTime.`)
    return [start, start + 1440]
  }
  if (start < end) return [start, end]
  warnOnce(`dayStartTime must be before dayEndTime; showing the whole day.`)
  return [0, 1440]
}
