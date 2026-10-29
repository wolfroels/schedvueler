import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  Temporal,
  groupByDay,
  rangeDays,
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
  /** Inside the current selection. */
  isSelected: boolean
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
  /** This item is the drag preview. */
  mirror: boolean
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

  /** Week rows without the drag preview, so dragging never re-packs the other events. */
  const baseWeeks = computed<MonthWeek<T>[]>(() => {
    const { range, hiddenDays, maxRows } = cfg.value
    const { locale, timeZone } = ctx.options.value
    const today = ctx.today.value
    const occurrences = ctx.occurrences.value
    const sel = ctx.interaction.selection.value
    const selStart = sel?.times.start.withTimeZone(timeZone).toPlainDate()
    const selEnd = sel
      ? sel.times.allDay
        ? sel.times.end.toPlainDate()
        : sel.times.end
            .withTimeZone(timeZone)
            .subtract({ nanoseconds: 1 })
            .toPlainDate()
            .add({ days: 1 })
      : undefined
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
          isSelected:
            !!selStart &&
            !!selEnd &&
            Temporal.PlainDate.compare(date, selStart) >= 0 &&
            Temporal.PlainDate.compare(date, selEnd) < 0,
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
          mirror: false,
        })
      })
      const more = layout.hiddenPerColumn
        .map((count, col) => ({ col, date: days[col]!, count }))
        .filter((m) => m.count > 0)

      result.push({ key: start.toString(), cells, events, more, rowCount: layout.rowCount })
    }
    return result
  })

  /**
   * Week rows with the drag preview drawn over them: in the row of the original when it is in the
   * same week, otherwise in the first row. The preview does not take part in the layout, so the
   * other events stay where they are while dragging.
   */
  const weeks = computed<MonthWeek<T>[]>(() => {
    const base = baseWeeks.value
    const mirror = ctx.interaction.mirror.value as
      (EventOccurrence<T> & { sourceKey: string }) | null
    if (!mirror) return base
    const { timeZone } = ctx.options.value
    return base.map((week) => {
      const days = week.cells.map((c) => c.date)
      const spans = spanRow([mirror], days, timeZone)
      if (!spans.length) return week
      const source = week.events.find((e) => e.occurrence.key === mirror.sourceKey)
      const previews = spans.map((s): MonthEventLayout<T> => {
        const bar =
          mirror.allDay || s.endCol - s.startCol > 1 || mirror.endMs - mirror.startMs >= 86_400_000
        return {
          key: mirror.key,
          occurrence: mirror,
          startCol: s.startCol,
          endCol: s.endCol,
          row: source?.row ?? 0,
          isStart: s.isStart,
          isEnd: s.isEnd,
          variant: bar ? 'month' : 'month-timed',
          mirror: true,
        }
      })
      return { ...week, events: [...week.events, ...previews] }
    })
  })

  /** Occurrences per visible day, computed once per change instead of per cell. */
  const byDay = computed(() => {
    const { range, hiddenDays } = cfg.value
    const days = rangeDays(range, hiddenDays)
    const map = new Map<string, EventOccurrence<T>[]>()
    for (const group of groupByDay(ctx.occurrences.value, days, ctx.options.value.timeZone)) {
      map.set(
        group.date.toString(),
        group.segments.map((s) => s.occurrence),
      )
    }
    return map
  })

  /** All occurrences touching a day, e.g. for the "+N more" popover. */
  function occurrencesOn(date: Temporal.PlainDate): EventOccurrence<T>[] {
    return byDay.value.get(date.toString()) ?? []
  }

  return { weekdays, weeks, occurrencesOn }
}
