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
  withTimes,
  zonedAtMinute,
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

export interface TimeGridOverlay {
  key: string
  kind: 'mirror' | 'selection'
  segment: DaySegment<unknown>
  top: number
  height: number
  /** False when the drag preview is over a spot `canDrop` refuses. */
  valid: boolean
}

export interface AllDayEventLayout<T> {
  key: string
  occurrence: EventOccurrence<T>
  startCol: number
  endCol: number
  row: number
  isStart: boolean
  isEnd: boolean
  /** This item is the drag preview. */
  mirror: boolean
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

  const mirror = computed(() => {
    const m = ctx.interaction.mirror.value
    // All-day events dropped in the grid show there even when the grid has no all-day row.
    if (!m) return null
    return { occurrence: m, inAllDayRow: m.allDay && cfg.value.allDaySlot }
  })

  const allDay = computed(() => {
    const { days } = cfg.value
    const m = mirror.value
    // While dragging in the all-day row, the preview takes the place of the original.
    const occurrences = m?.inAllDayRow
      ? [
          ...partitioned.value.allDay.filter((o) => o.key !== m.occurrence.sourceKey),
          m.occurrence as unknown as EventOccurrence<T>,
        ]
      : partitioned.value.allDay
    const spans = spanRow(occurrences, days, ctx.options.value.timeZone)
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
      mirror: s.occurrence === m?.occurrence,
    }))
    return { items, rowCount: layout.rowCount }
  })

  /**
   * Blocks drawn over the day columns without taking part in the overlap layout: the drag preview
   * of a timed event and a timed selection.
   */
  const overlays = computed<TimeGridOverlay[][]>(() => {
    const { days, dayStartMinute, dayEndMinute } = cfg.value
    const tz = ctx.options.value.timeZone
    const result: TimeGridOverlay[][] = days.map(() => [])
    const place = (
      occ: EventOccurrence<unknown>,
      kind: TimeGridOverlay['kind'],
      valid: boolean,
    ) => {
      segmentByDay([occ], days, tz).forEach((segments, i) => {
        for (const segment of segments) {
          const pos = verticalPosition(
            segment.startMinute,
            segment.endMinute,
            dayStartMinute,
            dayEndMinute,
          )
          if (pos) result[i]!.push({ key: `${kind}@${i}`, kind, segment, valid, ...pos })
        }
      })
    }
    const m = mirror.value
    if (m && !m.inAllDayRow) place(m.occurrence, 'mirror', m.occurrence.valid)
    const sel = ctx.interaction.selection.value
    if (sel && !sel.times.allDay) {
      place(
        withTimes({ key: 'selection' } as EventOccurrence<unknown>, sel.times),
        'selection',
        true,
      )
    }
    return result
  })

  /** Columns covered by an all-day selection. */
  const allDaySelection = computed(() => {
    const sel = ctx.interaction.selection.value
    if (!sel || !sel.times.allDay) return null
    const { days } = cfg.value
    const start = sel.times.start.toPlainDate()
    const end = sel.times.end.toPlainDate()
    const cols = days
      .map((d, i) =>
        Temporal.PlainDate.compare(d, start) >= 0 && Temporal.PlainDate.compare(d, end) < 0
          ? i
          : -1,
      )
      .filter((i) => i >= 0)
    return cols.length ? { startCol: cols[0]!, endCol: cols[cols.length - 1]! + 1 } : null
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
    return { start: zonedAtMinute(date, startMinute, tz), end: zonedAtMinute(date, endMinute, tz) }
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

  return { columns, slots, allDay, timed, overlays, allDaySelection, nowLine, slotRange, dayRange }
}
