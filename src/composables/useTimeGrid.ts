import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  Temporal,
  buildTimeSlots,
  dayBounds,
  formatDate,
  formatTimeOfDay,
  layoutDayGridRow,
  minutesIntoDay,
  partitionAllDay,
  segmentByDay,
  spanRow,
  verticalPosition,
  type DaySegment,
  type EventOccurrence,
  type TimeGridLayoutAlgorithm,
} from '../core'
import type { SchedulerContext } from './context'

export interface TimeGridConfig {
  days: readonly Temporal.PlainDate[]
  slotDuration: number
  slotLabelInterval: number
  dayStartMinute: number
  dayEndMinute: number
  layout: TimeGridLayoutAlgorithm
  allDaySlot: boolean
}

export interface TimeGridColumn {
  key: string
  date: Temporal.PlainDate
  isToday: boolean
  isPast: boolean
  isWeekend: boolean
  weekday: string
  dayNumber: string
}

export interface TimeGridSlotRow {
  startMinute: number
  endMinute: number
  /** Label shown at the top of the row, empty between labelled rows. */
  label: string
  isLabelled: boolean
}

export interface TimedEventLayout<T> {
  key: string
  segment: DaySegment<T>
  /** Fractions (0-1) of the column. */
  top: number
  height: number
  left: number
  width: number
  order: number
}

export interface AllDayEventLayout<T> {
  key: string
  occurrence: EventOccurrence<T>
  startCol: number
  endCol: number
  row: number
  isStart: boolean
  isEnd: boolean
}

/** Headless time-grid layout: columns, time rows, positioned events and the now line. */
export function useTimeGrid<T>(ctx: SchedulerContext<T>, config: MaybeRefOrGetter<TimeGridConfig>) {
  const cfg = computed(() => toValue(config))

  const columns = computed<TimeGridColumn[]>(() => {
    const { locale } = ctx.options.value
    const today = ctx.today.value
    return cfg.value.days.map((date) => {
      const cmp = Temporal.PlainDate.compare(date, today)
      return {
        key: date.toString(),
        date,
        isToday: cmp === 0,
        isPast: cmp < 0,
        isWeekend: date.dayOfWeek >= 6,
        weekday: formatDate(date, locale, { weekday: 'short' }),
        dayNumber: formatDate(date, locale, { day: 'numeric' }),
      }
    })
  })

  const slots = computed<TimeGridSlotRow[]>(() => {
    const { slotDuration, slotLabelInterval, dayStartMinute, dayEndMinute } = cfg.value
    const { locale, hour12 } = ctx.options.value
    return buildTimeSlots(dayStartMinute, dayEndMinute, slotDuration).map((slot) => {
      const isLabelled = slot.startMinute % slotLabelInterval === 0
      return {
        ...slot,
        isLabelled,
        label: isLabelled
          ? formatTimeOfDay(slot.startMinute, locale, { hour12, compact: true })
          : '',
      }
    })
  })

  const partitioned = computed(() => {
    const parts = partitionAllDay(ctx.occurrences.value)
    // Without an all-day row, all-day events go into the grid as full-day blocks.
    return cfg.value.allDaySlot ? parts : { allDay: [], timed: ctx.occurrences.value }
  })

  const allDay = computed(() => {
    const { days } = cfg.value
    const spans = spanRow(partitioned.value.allDay, days, ctx.options.value.timeZone)
    const layout = layoutDayGridRow(
      spans.map((s) => ({ start: s.startCol, end: s.endCol })),
      days.length,
    )
    const items: AllDayEventLayout<T>[] = spans.map((s, i) => ({
      key: s.occurrence.key,
      occurrence: s.occurrence,
      startCol: s.startCol,
      endCol: s.endCol,
      row: layout.rows[i]!,
      isStart: s.isStart,
      isEnd: s.isEnd,
    }))
    return { items, rowCount: layout.rowCount }
  })

  const timed = computed<TimedEventLayout<T>[][]>(() => {
    const { days, layout, dayStartMinute, dayEndMinute, slotDuration } = cfg.value
    const perDay = segmentByDay(partitioned.value.timed, days, ctx.options.value.timeZone)
    return perDay.map((segments) => {
      const visible: { segment: DaySegment<T>; top: number; height: number }[] = []
      for (const segment of segments) {
        const pos = verticalPosition(
          segment.startMinute,
          segment.endMinute,
          dayStartMinute,
          dayEndMinute,
        )
        if (pos) visible.push({ segment, ...pos })
      }
      const placements = layout(
        visible.map((v) => ({ start: v.segment.startMinute, end: v.segment.endMinute })),
        { minDuration: slotDuration / 2 },
      )
      return visible.map((v, i) => {
        const p = placements[i]!
        return {
          key: `${v.segment.occurrence.key}@${v.segment.dayIndex}`,
          segment: v.segment,
          top: v.top,
          height: v.height,
          left: p.left,
          width: p.width,
          order: p.order,
        }
      })
    })
  })

  /** Where to draw the now line, or `null` when today is not visible. */
  const nowLine = computed(() => {
    const now = ctx.now.value
    const date = now.toPlainDate()
    const columnIndex = cfg.value.days.findIndex((d) => d.equals(date))
    if (columnIndex < 0) return null
    const { dayStartMinute, dayEndMinute } = cfg.value
    const minute = minutesIntoDay(now)
    if (minute < dayStartMinute || minute > dayEndMinute) return null
    return { columnIndex, top: (minute - dayStartMinute) / (dayEndMinute - dayStartMinute), now }
  })

  /** Start and end of a slot in a column, for slot-click payloads and the `time-slot` slot. */
  function slotRange(date: Temporal.PlainDate, startMinute: number, endMinute: number) {
    const tz = ctx.options.value.timeZone
    const toZoned = (minute: number) =>
      minute >= 1440
        ? date.add({ days: 1 }).toZonedDateTime({ timeZone: tz })
        : date
            .toPlainDateTime({ hour: Math.floor(minute / 60), minute: minute % 60 })
            .toZonedDateTime(tz, { disambiguation: 'compatible' })
    return { start: toZoned(startMinute), end: toZoned(endMinute) }
  }

  /** Start and end of a whole day, for all-day slot clicks. */
  function dayRange(date: Temporal.PlainDate) {
    const tz = ctx.options.value.timeZone
    const bounds = dayBounds(date, tz)
    return {
      start: Temporal.Instant.fromEpochMilliseconds(bounds.startMs).toZonedDateTimeISO(tz),
      end: Temporal.Instant.fromEpochMilliseconds(bounds.endMs).toZonedDateTimeISO(tz),
    }
  }

  return { columns, slots, allDay, timed, nowLine, slotRange, dayRange }
}
