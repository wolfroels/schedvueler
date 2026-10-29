import type { RecurrenceRule } from './rule'
import {
  civil,
  daysInMonth,
  daysInYear,
  epochDay,
  isoWeekday,
  weekNumber,
  weekStartDay,
  weeksInYear,
} from './civil'

/**
 * Wall-clock moment encoded as seconds since 1970-01-01T00:00 local time (no zone).
 * Plain numbers keep the hot loop free of allocations and make ordering a numeric compare.
 */
export type LocalSeconds = number

export const SECONDS_PER_DAY = 86400

export function toLocalSeconds(days: number, secondOfDay: number): LocalSeconds {
  return days * SECONDS_PER_DAY + secondOfDay
}

export function splitLocalSeconds(value: LocalSeconds): { days: number; secondOfDay: number } {
  const days = Math.floor(value / SECONDS_PER_DAY)
  return { days, secondOfDay: value - days * SECONDS_PER_DAY }
}

export interface IterateOptions {
  /** Series start (DTSTART) as local seconds. */
  start: LocalSeconds
  /** All-day series ignore time parts of the rule. */
  allDay: boolean
  /** Inclusive last allowed occurrence, already converted to local seconds. */
  until?: LocalSeconds
  /**
   * Skip whole periods before this point. Only valid for rules without COUNT, because COUNT has
   * to be counted from the series start.
   */
  fastForwardTo?: LocalSeconds
}

/** Stop after this many consecutive periods without a single candidate (e.g. `BYMONTHDAY=30;BYMONTH=2`). */
const MAX_EMPTY_PERIODS: Record<RecurrenceRule['freq'], number> = {
  YEARLY: 1_000,
  MONTHLY: 5_000,
  WEEKLY: 5_000,
  DAILY: 10_000,
  HOURLY: 50_000,
  MINUTELY: 1_000_000,
}

/**
 * Yields every occurrence start of a rule in ascending order, as local seconds.
 * The series start always counts as the first occurrence (RFC 5545 §3.3.10), even if the rule
 * itself would not produce it.
 */
export function* iterateRule(
  rule: RecurrenceRule,
  options: IterateOptions,
): Generator<LocalSeconds> {
  const { start, allDay, until } = options
  const { days: startDay, secondOfDay: startSecond } = splitLocalSeconds(start)
  const startCivil = civil(startDay)
  const startHour = Math.floor(startSecond / 3600)
  const startMinute = Math.floor((startSecond % 3600) / 60)
  const startSec = startSecond % 60

  const { freq, interval, count, wkst } = rule
  let byMonth = rule.byMonth
  let byMonthDay = rule.byMonthDay
  let byDay = rule.byDay
  const { byWeekNo, byYearDay, bySetPos } = rule

  // Fill in the implied parts from DTSTART, e.g. FREQ=MONTHLY repeats on DTSTART's day of month.
  if (!byWeekNo && !byYearDay && !byMonthDay && !byDay) {
    if (freq === 'YEARLY') {
      byMonth ??= [startCivil.month]
      byMonthDay = [startCivil.day]
    } else if (freq === 'MONTHLY') {
      byMonthDay = [startCivil.day]
    } else if (freq === 'WEEKLY') {
      byDay = [{ weekday: isoWeekday(startDay) }]
    }
  }

  // Ordinals in BYDAY ("2nd Monday") count within the month or the year, depending on the rule.
  const nthScope: 'month' | 'year' | 'none' =
    freq === 'MONTHLY' || (freq === 'YEARLY' && byMonth)
      ? 'month'
      : freq === 'YEARLY' && !byWeekNo
        ? 'year'
        : 'none'

  const sortedUnique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b)
  const hours = allDay ? [0] : sortedUnique(rule.byHour ?? [startHour])
  const minutes = allDay ? [0] : sortedUnique(rule.byMinute ?? [startMinute])
  const seconds = allDay ? [0] : sortedUnique(rule.bySecond ?? [startSec])

  function dayMatches(days: number, periodYear: number): boolean {
    const { year, month, day } = civil(days)
    if (byMonth && !byMonth.includes(month)) return false
    if (byWeekNo) {
      const wk = weekNumber(days, wkst)
      if (wk.year !== periodYear) return false
      const total = weeksInYear(wk.year, wkst)
      if (!byWeekNo.some((n) => (n > 0 ? wk.week === n : wk.week === total + n + 1))) return false
    }
    if (byYearDay) {
      const doy = days - epochDay(year, 1, 1) + 1
      const diy = daysInYear(year)
      if (!byYearDay.some((n) => (n > 0 ? doy === n : doy === diy + n + 1))) return false
    }
    if (byMonthDay) {
      const dim = daysInMonth(year, month)
      if (!byMonthDay.some((n) => (n > 0 ? day === n : day === dim + n + 1))) return false
    }
    if (byDay) {
      const weekday = isoWeekday(days)
      const ok = byDay.some((rule) => {
        if (rule.weekday !== weekday) return false
        if (rule.nth === undefined || nthScope === 'none') return true
        let index: number
        let total: number
        if (nthScope === 'month') {
          index = day
          total = daysInMonth(year, month)
        } else {
          index = days - epochDay(year, 1, 1) + 1
          total = daysInYear(year)
        }
        return rule.nth > 0
          ? Math.ceil(index / 7) === rule.nth
          : Math.floor((total - index) / 7) + 1 === -rule.nth
      })
      if (!ok) return false
    }
    return true
  }

  // Period bookkeeping. Each frequency maps a period index to the first period's offset.
  const startWeek = weekStartDay(startDay, wkst)
  const startMonthIndex = startCivil.year * 12 + startCivil.month - 1
  const startHourIndex = startDay * 24 + startHour
  const startMinuteIndex = startHourIndex * 60 + startMinute

  function firstPeriodIndex(): number {
    const target = options.fastForwardTo
    if (target === undefined || count !== undefined || target <= start) return 0
    const { days, secondOfDay } = splitLocalSeconds(target)
    let distance: number
    switch (freq) {
      case 'YEARLY':
        distance = civil(days).year - startCivil.year
        break
      case 'MONTHLY': {
        const c = civil(days)
        distance = c.year * 12 + c.month - 1 - startMonthIndex
        break
      }
      case 'WEEKLY':
        distance = (weekStartDay(days, wkst) - startWeek) / 7
        break
      case 'DAILY':
        distance = days - startDay
        break
      case 'HOURLY':
        distance = days * 24 + Math.floor(secondOfDay / 3600) - startHourIndex
        break
      case 'MINUTELY':
        distance =
          (days * 24 + Math.floor(secondOfDay / 3600)) * 60 +
          Math.floor((secondOfDay % 3600) / 60) -
          startMinuteIndex
        break
    }
    return Math.max(0, Math.floor(distance / interval))
  }

  /** Candidate occurrences of one period, ascending, before BYSETPOS. */
  function periodCandidates(index: number): LocalSeconds[] {
    const step = index * interval
    const dayCandidates: number[] = []
    let periodYear = 0
    let timeHours = hours
    let timeMinutes = minutes

    const collect = (from: number, to: number) => {
      for (let d = from; d < to; d++) if (dayMatches(d, periodYear)) dayCandidates.push(d)
    }

    switch (freq) {
      case 'YEARLY': {
        periodYear = startCivil.year + step
        const from = epochDay(periodYear, 1, 1)
        const to = epochDay(periodYear + 1, 1, 1)
        // Week 1 can start in late December and the last week can end in early January.
        if (byWeekNo) collect(from - 6, to + 6)
        else collect(from, to)
        break
      }
      case 'MONTHLY': {
        const monthIndex = startMonthIndex + step
        const year = Math.floor(monthIndex / 12)
        const month = monthIndex - year * 12 + 1
        periodYear = year
        const from = epochDay(year, month, 1)
        collect(from, from + daysInMonth(year, month))
        break
      }
      case 'WEEKLY': {
        const from = startWeek + step * 7
        periodYear = civil(from).year
        collect(from, from + 7)
        break
      }
      case 'DAILY': {
        const day = startDay + step
        periodYear = civil(day).year
        collect(day, day + 1)
        break
      }
      case 'HOURLY': {
        const hourIndex = startHourIndex + step
        const day = Math.floor(hourIndex / 24)
        const hour = hourIndex - day * 24
        if (rule.byHour && !rule.byHour.includes(hour)) return []
        periodYear = civil(day).year
        collect(day, day + 1)
        timeHours = [hour]
        break
      }
      case 'MINUTELY': {
        const minuteIndex = startMinuteIndex + step
        const hourIndex = Math.floor(minuteIndex / 60)
        const minute = minuteIndex - hourIndex * 60
        const day = Math.floor(hourIndex / 24)
        const hour = hourIndex - day * 24
        if (rule.byHour && !rule.byHour.includes(hour)) return []
        if (rule.byMinute && !rule.byMinute.includes(minute)) return []
        periodYear = civil(day).year
        collect(day, day + 1)
        timeHours = [hour]
        timeMinutes = [minute]
        break
      }
    }

    const out: LocalSeconds[] = []
    for (const day of dayCandidates) {
      for (const h of timeHours) {
        for (const m of timeMinutes) {
          for (const s of seconds) out.push(toLocalSeconds(day, h * 3600 + m * 60 + s))
        }
      }
    }
    if (!bySetPos) return out
    const picked = new Set<LocalSeconds>()
    for (const pos of bySetPos) {
      const value = pos > 0 ? out[pos - 1] : out[out.length + pos]
      if (value !== undefined) picked.add(value)
    }
    return [...picked].sort((a, b) => a - b)
  }

  let emitted = 0
  let index = firstPeriodIndex()
  if (index === 0) {
    if (until !== undefined && start > until) return
    yield start
    emitted++
    if (count !== undefined && emitted >= count) return
  }

  const maxEmpty = MAX_EMPTY_PERIODS[freq]
  let emptyPeriods = 0
  for (; ; index++) {
    const candidates = periodCandidates(index)
    if (candidates.length === 0) {
      if (++emptyPeriods > maxEmpty) return
      continue
    }
    emptyPeriods = 0
    for (const candidate of candidates) {
      if (candidate <= start) continue
      if (until !== undefined && candidate > until) return
      yield candidate
      emitted++
      if (count !== undefined && emitted >= count) return
    }
  }
}
