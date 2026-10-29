import { Temporal } from './temporal'
import { dayBounds, eachDay, startOfMonth, startOfWeek } from './dates'
import type { TimeWindow } from './types'

/** Half-open range of calendar dates: `start` is included, `end` is not. */
export interface DateRange {
  start: Temporal.PlainDate
  end: Temporal.PlainDate
}

/** What a view shows. */
export interface VisibleRange extends DateRange {
  /**
   * The period the view is "about". Equal to the visible range except in views that pad with
   * neighbouring days, such as the month view showing the end of the previous month.
   */
  active: DateRange
}

/** Decides what a view shows for an anchor date and how navigation moves the anchor. */
export interface RangeStrategy {
  range(anchor: Temporal.PlainDate): VisibleRange
  /** Moves the anchor one step forward (`1`) or back (`-1`). */
  step(anchor: Temporal.PlainDate, direction: 1 | -1): Temporal.PlainDate
}

function sameRange(range: DateRange): VisibleRange {
  return { ...range, active: range }
}

export interface DayRangeOptions {
  /** Number of consecutive days shown. Default 1. */
  days?: number
  /** Days moved per navigation step. Defaults to `days`. */
  stepDays?: number
}

/** One or more consecutive days starting at the anchor (day view, 3-day view, ...). */
export function dayStrategy(options: DayRangeOptions = {}): RangeStrategy {
  const days = options.days ?? 1
  const stepDays = options.stepDays ?? days
  return {
    range: (anchor) => sameRange({ start: anchor, end: anchor.add({ days }) }),
    step: (anchor, direction) => anchor.add({ days: stepDays * direction }),
  }
}

export interface WeekRangeOptions {
  /** ISO weekday the week starts on: 1 = Monday ... 7 = Sunday. Default 1. */
  weekStart?: number
  /** Number of days shown from the week start, e.g. 5 for a work week. Default 7. */
  days?: number
  /** Number of weeks shown. Default 1. */
  weeks?: number
}

/** The week(s) containing the anchor. */
export function weekStrategy(options: WeekRangeOptions = {}): RangeStrategy {
  const weekStart = options.weekStart ?? 1
  const weeks = options.weeks ?? 1
  const days = options.days ?? 7
  return {
    range(anchor) {
      const start = startOfWeek(anchor, weekStart)
      const end = start.add({ days: (weeks - 1) * 7 + days })
      return sameRange({ start, end })
    },
    step: (anchor, direction) => anchor.add({ weeks: weeks * direction }),
  }
}

export interface MonthRangeOptions {
  /** ISO weekday the week starts on: 1 = Monday ... 7 = Sunday. Default 1. */
  weekStart?: number
  /** Always show 6 weeks so the grid height never changes. Default false. */
  fixedWeeks?: boolean
}

/** The month containing the anchor, padded out to whole weeks. */
export function monthStrategy(options: MonthRangeOptions = {}): RangeStrategy {
  const weekStart = options.weekStart ?? 1
  return {
    range(anchor) {
      const activeStart = startOfMonth(anchor)
      const activeEnd = activeStart.add({ months: 1 })
      const start = startOfWeek(activeStart, weekStart)
      let end = startOfWeek(activeEnd.subtract({ days: 1 }), weekStart).add({ days: 7 })
      if (options.fixedWeeks) end = start.add({ weeks: 6 })
      return { start, end, active: { start: activeStart, end: activeEnd } }
    },
    step: (anchor, direction) => anchor.add({ months: direction }),
  }
}

/** The calendar year containing the anchor. */
export function yearStrategy(): RangeStrategy {
  return {
    range(anchor) {
      const start = anchor.with({ month: 1, day: 1 })
      return sameRange({ start, end: start.add({ years: 1 }) })
    },
    step: (anchor, direction) => anchor.add({ years: direction }),
  }
}

/** Epoch-ms window covering a date range in the given zone. */
export function rangeToWindow(range: DateRange, timeZone: string): TimeWindow {
  return {
    startMs: dayBounds(range.start, timeZone).startMs,
    endMs: dayBounds(range.end, timeZone).startMs,
  }
}

/**
 * Dates in the range, minus hidden weekdays.
 * @param hiddenWeekdays ISO weekdays to leave out, e.g. `[6, 7]` hides weekends.
 */
export function rangeDays(
  range: DateRange,
  hiddenWeekdays: readonly number[] = [],
): Temporal.PlainDate[] {
  const days = eachDay(range.start, range.end)
  return hiddenWeekdays.length ? days.filter((d) => !hiddenWeekdays.includes(d.dayOfWeek)) : days
}

export function rangeContains(range: DateRange, date: Temporal.PlainDate): boolean {
  return (
    Temporal.PlainDate.compare(date, range.start) >= 0 &&
    Temporal.PlainDate.compare(date, range.end) < 0
  )
}
