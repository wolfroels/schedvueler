import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  Temporal,
  buildTimeSlots,
  dayBounds,
  formatDate,
  formatTimeOfDay,
  groupByResource,
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
  type ResourceId,
  type ResourceNode,
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
  /** One column per resource and day. Events show in the columns of their resources. */
  resources?: readonly ResourceNode<unknown>[]
  /** Column order with resources: all days per resource, or all resources per day. */
  groupBy?: 'resource' | 'date'
}

export interface TimeGridColumn {
  key: string
  date: Temporal.PlainDate
  dayIndex: number
  resource: ResourceNode<unknown> | undefined
  resourceId: ResourceId | undefined
  /** Last column of a resource (or day) group, when columns are grouped. */
  isGroupEnd: boolean
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

  /** Resources as column groups; a single `undefined` group without resources. */
  const groups = computed(() => (cfg.value.resources?.length ? cfg.value.resources : [undefined]))
  const byResource = computed(() => cfg.value.resources?.length && cfg.value.groupBy !== 'date')

  /** Column index of a day within a resource group. */
  function colIndex(day: number, group: number): number {
    const dayCount = cfg.value.days.length
    return byResource.value ? group * dayCount + day : day * groups.value.length + group
  }

  const columns = computed<TimeGridColumn[]>(() => {
    const { locale } = ctx.options.value
    const today = ctx.today.value
    const { days } = cfg.value
    const list = groups.value
    const grouped = list.length > 1
    const out: TimeGridColumn[] = Array.from({ length: days.length * list.length })
    days.forEach((date, d) => {
      const cmp = Temporal.PlainDate.compare(date, today)
      list.forEach((resource, g) => {
        const index = colIndex(d, g)
        out[index] = {
          key: resource ? `${date}|${resource.id}` : date.toString(),
          date,
          dayIndex: d,
          resource,
          resourceId: resource?.id,
          isGroupEnd: grouped && (byResource.value ? d === days.length - 1 : g === list.length - 1),
          isToday: cmp === 0,
          isPast: cmp < 0,
          isWeekend: date.dayOfWeek >= 6,
          weekday: formatDate(date, locale, { weekday: 'short' }),
          dayNumber: formatDate(date, locale, { day: 'numeric' }),
        }
      })
    })
    return out
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

  /** Occurrences per column group. */
  function perGroup<O extends EventOccurrence<unknown>>(occurrences: readonly O[]): O[][] {
    if (!cfg.value.resources?.length) return [occurrences.slice()]
    const map = groupByResource(occurrences)
    return groups.value.map((r) => map.get(r!.id) ?? [])
  }

  const mirror = computed(() => {
    const m = ctx.interaction.mirror.value
    // All-day events dropped in the grid show there even when the grid has no all-day row.
    if (!m) return null
    return { occurrence: m, inAllDayRow: m.allDay && cfg.value.allDaySlot }
  })

  const allDay = computed(() => {
    const { days } = cfg.value
    const tz = ctx.options.value.timeZone
    const m = mirror.value
    // While dragging in the all-day row, the preview takes the place of the original.
    const occurrences = m?.inAllDayRow
      ? [
          ...partitioned.value.allDay.filter((o) => o.key !== m.occurrence.sourceKey),
          m.occurrence as unknown as EventOccurrence<T>,
        ]
      : partitioned.value.allDay
    const spans: {
      occurrence: EventOccurrence<T>
      startCol: number
      endCol: number
      isStart: boolean
      isEnd: boolean
    }[] = []
    perGroup(occurrences).forEach((list, g) => {
      for (const s of spanRow(list, days, tz)) {
        if (byResource.value || groups.value.length === 1) {
          const start = colIndex(s.startCol, g)
          spans.push({ ...s, startCol: start, endCol: start + s.endCol - s.startCol })
          continue
        }
        // Columns of one resource are not adjacent when grouped by date: one piece per day.
        for (let d = s.startCol; d < s.endCol; d++) {
          const col = colIndex(d, g)
          spans.push({
            occurrence: s.occurrence,
            startCol: col,
            endCol: col + 1,
            isStart: s.isStart && d === s.startCol,
            isEnd: s.isEnd && d === s.endCol - 1,
          })
        }
      }
    })
    const layout = layoutDayGridRow(
      spans.map((s) => ({ start: s.startCol, end: s.endCol })),
      columns.value.length,
    )
    const items: AllDayEventLayout<T>[] = spans.map((s, i) => ({
      key: `${s.occurrence.key}@${s.startCol}`,
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
   * Blocks drawn over the columns without taking part in the overlap layout: the drag preview of
   * a timed event and a timed selection.
   */
  const overlays = computed<TimeGridOverlay[][]>(() => {
    const { days, dayStartMinute, dayEndMinute } = cfg.value
    const tz = ctx.options.value.timeZone
    const result: TimeGridOverlay[][] = columns.value.map(() => [])
    const place = (
      occ: EventOccurrence<unknown>,
      kind: TimeGridOverlay['kind'],
      valid: boolean,
    ) => {
      groups.value.forEach((resource, g) => {
        if (resource && occ.resourceIds && !occ.resourceIds.includes(resource.id)) return
        segmentByDay([occ], days, tz).forEach((segments, d) => {
          const col = colIndex(d, g)
          for (const segment of segments) {
            const pos = verticalPosition(
              segment.startMinute,
              segment.endMinute,
              dayStartMinute,
              dayEndMinute,
            )
            if (pos) result[col]!.push({ key: `${kind}@${col}`, kind, segment, valid, ...pos })
          }
        })
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

  /** Column ranges covered by an all-day selection (several when grouped by date). */
  const allDaySelection = computed(() => {
    const sel = ctx.interaction.selection.value
    if (!sel || !sel.times.allDay) return []
    const start = sel.times.start.toPlainDate()
    const end = sel.times.end.toPlainDate()
    const resourceId = sel.times.resourceIds?.[0]
    const ranges: { startCol: number; endCol: number }[] = []
    columns.value.forEach((col, i) => {
      const inside =
        Temporal.PlainDate.compare(col.date, start) >= 0 &&
        Temporal.PlainDate.compare(col.date, end) < 0 &&
        (resourceId === undefined || col.resourceId === undefined || col.resourceId === resourceId)
      if (!inside) return
      const last = ranges[ranges.length - 1]
      if (last && last.endCol === i) last.endCol = i + 1
      else ranges.push({ startCol: i, endCol: i + 1 })
    })
    return ranges
  })

  const timed = computed<TimedEventLayout<T>[][]>(() => {
    const { days, layout, dayStartMinute, dayEndMinute, slotDuration } = cfg.value
    const tz = ctx.options.value.timeZone
    const result: TimedEventLayout<T>[][] = columns.value.map(() => [])
    perGroup(partitioned.value.timed).forEach((list, g) => {
      segmentByDay(list, days, tz).forEach((segments, d) => {
        const col = colIndex(d, g)
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
        result[col] = visible.map((v, i) => {
          const p = placements[i]!
          return {
            key: `${v.segment.occurrence.key}@${col}`,
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
    return result
  })

  /** Where to draw the now line, or `null` when today is not visible. */
  const nowLine = computed(() => {
    const now = ctx.now.value
    const date = now.toPlainDate()
    const columnIndexes = columns.value.flatMap((c, i) => (c.date.equals(date) ? [i] : []))
    if (!columnIndexes.length) return null
    const { dayStartMinute, dayEndMinute } = cfg.value
    const minute = minutesIntoDay(now)
    if (minute < dayStartMinute || minute > dayEndMinute) return null
    return {
      columnIndex: columnIndexes[0]!,
      columnIndexes,
      top: (minute - dayStartMinute) / (dayEndMinute - dayStartMinute),
      now,
    }
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
