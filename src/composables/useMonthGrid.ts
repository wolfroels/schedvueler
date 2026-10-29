import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  Temporal,
  dayBounds,
  formatDate,
  layoutDayGridRow,
  rangeContains,
  spanRow,
  type EventOccurrence,
  type VisibleRange,
} from '../core'
import type { EventVariant } from '../types'
import type { SchedulerContext } from './context'

export interface MonthGridConfig {
  range: VisibleRange
  hiddenDays: readonly number[]
  /** Rows per day cell including the "+N more" row. `undefined` shows everything. */
  maxRows: number | undefined
}

export interface MonthCell {
  key: string
  date: Temporal.PlainDate
  dayNumber: string
  isToday: boolean
  isPast: boolean
  isOtherMonth: boolean
}

export interface MonthEventLayout<T> {
  key: string
  occurrence: EventOccurrence<T>
  startCol: number
  endCol: number
  row: number
  isStart: boolean
  isEnd: boolean
  variant: Extract<EventVariant, 'month' | 'month-timed'>
}

export interface MonthMoreLink {
  col: number
  date: Temporal.PlainDate
  count: number
}

export interface MonthWeek<T> {
  key: string
  cells: MonthCell[]
  events: MonthEventLayout<T>[]
  more: MonthMoreLink[]
  rowCount: number
}

/** Headless month layout: week rows of cells with stacked event bars and overflow counts. */
export function useMonthGrid<T>(
  ctx: SchedulerContext<T>,
  config: MaybeRefOrGetter<MonthGridConfig>,
) {
  const cfg = computed(() => toValue(config))

  const weekdays = computed(() => {
    const { locale } = ctx.options.value
    const { range, hiddenDays } = cfg.value
    const labels: { weekday: number; label: string }[] = []
    for (let i = 0; i < 7; i++) {
      const date = range.start.add({ days: i })
      if (hiddenDays.includes(date.dayOfWeek)) continue
      labels.push({
        weekday: date.dayOfWeek,
        label: formatDate(date, locale, { weekday: 'short' }),
      })
    }
    return labels
  })

  const weeks = computed<MonthWeek<T>[]>(() => {
    const { range, hiddenDays, maxRows } = cfg.value
    const { locale, timeZone } = ctx.options.value
    const today = ctx.today.value
    const occurrences = ctx.occurrences.value
    const result: MonthWeek<T>[] = []

    for (
      let start = range.start;
      Temporal.PlainDate.compare(start, range.end) < 0;
      start = start.add({ days: 7 })
    ) {
      const days: Temporal.PlainDate[] = []
      for (let i = 0; i < 7; i++) {
        const date = start.add({ days: i })
        if (!hiddenDays.includes(date.dayOfWeek)) days.push(date)
      }
      const cells = days.map((date) => {
        const cmp = Temporal.PlainDate.compare(date, today)
        return {
          key: date.toString(),
          date,
          dayNumber: formatDate(date, locale, { day: 'numeric' }),
          isToday: cmp === 0,
          isPast: cmp < 0,
          isOtherMonth: !rangeContains(range.active, date),
        }
      })

      const spans = spanRow(occurrences, days, timeZone)
      const layout = layoutDayGridRow(
        spans.map((s) => ({ start: s.startCol, end: s.endCol })),
        days.length,
        { maxRows },
      )
      const events: MonthEventLayout<T>[] = []
      spans.forEach((s, i) => {
        const row = layout.rows[i]!
        if (row < 0) return
        const occ = s.occurrence
        const bar = occ.allDay || s.endCol - s.startCol > 1 || occ.endMs - occ.startMs >= 86_400_000
        events.push({
          key: occ.key,
          occurrence: occ,
          startCol: s.startCol,
          endCol: s.endCol,
          row,
          isStart: s.isStart,
          isEnd: s.isEnd,
          variant: bar ? 'month' : 'month-timed',
        })
      })
      const more = layout.hiddenPerColumn
        .map((count, col) => ({ col, date: days[col]!, count }))
        .filter((m) => m.count > 0)

      result.push({ key: start.toString(), cells, events, more, rowCount: layout.rowCount })
    }
    return result
  })

  /** All occurrences touching a day, e.g. for the "+N more" popover. */
  function occurrencesOn(date: Temporal.PlainDate): EventOccurrence<T>[] {
    const { startMs, endMs } = dayBounds(date, ctx.options.value.timeZone)
    return ctx.occurrences.value.filter(
      (o) =>
        o.startMs < endMs && (o.endMs > startMs || (o.endMs === o.startMs && o.startMs >= startMs)),
    )
  }

  return { weekdays, weeks, occurrencesOn }
}
