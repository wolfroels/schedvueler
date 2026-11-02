import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  Temporal,
  calendarMonths,
  formatDate,
  segmentByDay,
  startOfWeek,
  type EventOccurrence,
} from '../core'
import type { SchedulerContext } from './context'

export interface YearGridConfig {
  /** First day of the year (or of any 12-month span). */
  start: Temporal.PlainDate
  /** Number of months shown. Default the months of that year. */
  months?: number
  /** Calendar whose months are shown, such as "persian". Default Gregorian. */
  calendar?: string
  weekStart: number
  /** ISO weekdays left out of the grids. */
  hiddenDays: readonly number[]
}

export interface YearDayCell<T> {
  key: string
  date: Temporal.PlainDate
  dayNumber: string
  isToday: boolean
  isPast: boolean
  isWeekend: boolean
  /** Occurrences touching this day. */
  occurrences: EventOccurrence<T>[]
  /** 0 for no events, otherwise 1-4 relative to the busiest day of the year. */
  level: number
}

export interface YearMonth<T> {
  key: string
  /** First day of the month. */
  date: Temporal.PlainDate
  label: string
  /** Cells in grid order; `null` pads the first and last week. */
  cells: (YearDayCell<T> | null)[]
}

/** Headless year layout: one small month grid per month, with the events per day. */
export function useYearGrid<T>(ctx: SchedulerContext<T>, config: MaybeRefOrGetter<YearGridConfig>) {
  const cfg = computed(() => toValue(config))

  const weekdays = computed(() => {
    const { weekStart, hiddenDays } = cfg.value
    const { locale } = ctx.options.value
    // 2024-01-01 was a Monday.
    const monday = Temporal.PlainDate.from('2024-01-01')
    return Array.from({ length: 7 }, (_, i) => ((weekStart - 1 + i) % 7) + 1)
      .filter((d) => !hiddenDays.includes(d))
      .map((weekday) => ({
        weekday,
        label: formatDate(monday.add({ days: weekday - 1 }), locale, { weekday: 'narrow' }),
      }))
  })

  const spans = computed(() =>
    calendarMonths(cfg.value.start, cfg.value.calendar, cfg.value.months),
  )

  /** Every day shown, and the occurrences per day. */
  const byDay = computed(() => {
    const { start } = cfg.value
    const last = spans.value[spans.value.length - 1]!
    const end = last.date.add({ days: last.days })
    const days: Temporal.PlainDate[] = []
    for (let d = start; Temporal.PlainDate.compare(d, end) < 0; d = d.add({ days: 1 })) days.push(d)
    const segments = segmentByDay(ctx.occurrences.value, days, ctx.options.value.timeZone)
    const map = new Map<string, EventOccurrence<T>[]>()
    let max = 0
    days.forEach((d, i) => {
      const list = segments[i]!.map((s) => s.occurrence)
      if (list.length) map.set(d.toString(), list)
      max = Math.max(max, list.length)
    })
    return { map, max }
  })

  const months = computed<YearMonth<T>[]>(() => {
    const { weekStart, hiddenDays } = cfg.value
    const { locale } = ctx.options.value
    const today = ctx.today.value
    const { map, max } = byDay.value
    const columns = weekdays.value.map((w) => w.weekday)
    return spans.value.map(({ date: first, days }) => {
      const cells: (YearDayCell<T> | null)[] = []
      // Pad the first week up to the month's first visible weekday.
      const gridStart = startOfWeek(first, weekStart)
      for (let d = gridStart; Temporal.PlainDate.compare(d, first) < 0; d = d.add({ days: 1 }))
        if (!hiddenDays.includes(d.dayOfWeek)) cells.push(null)
      for (let day = 1; day <= days; day++) {
        const date = first.add({ days: day - 1 })
        if (hiddenDays.includes(date.dayOfWeek)) continue
        const key = date.toString()
        const occurrences = map.get(key) ?? []
        const cmp = Temporal.PlainDate.compare(date, today)
        cells.push({
          key,
          date,
          dayNumber: String(day),
          isToday: cmp === 0,
          isPast: cmp < 0,
          isWeekend: date.dayOfWeek >= 6,
          occurrences,
          level: occurrences.length ? Math.max(1, Math.ceil((occurrences.length / max) * 4)) : 0,
        })
      }
      while (cells.length % columns.length) cells.push(null)
      return {
        key: first.toString(),
        date: first,
        label: formatDate(first, locale, { month: 'long' }),
        cells,
      }
    })
  })

  return { weekdays, months }
}
