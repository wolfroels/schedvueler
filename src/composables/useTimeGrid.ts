import { computed, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  Temporal,
  buildTimeSlots,
  dayBounds,
  emptyStretches,
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
  /** Collapse stretches without events of at least this many minutes. */
  foldMinutes?: number
  /** Take overlapping events together from this many on. */
  stackThreshold?: number
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
  /** This row stands for a stretch without events. */
  isFold: boolean
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

/** Overlapping events taken together. */
export interface EventStack<T> {
  key: string
  top: number
  height: number
  occurrences: EventOccurrence<T>[]
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

  /** Where a column's day begins, for days running past midnight. */
  const dayOffset = computed(() => (cfg.value.dayEndMinute > 1440 ? cfg.value.dayStartMinute : 0))

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

  /** Stretches without events in any column, with `foldMinutes`. */
  const folds = computed(() => {
    const { foldMinutes, days, dayStartMinute, dayEndMinute, slotDuration } = cfg.value
    if (!foldMinutes) return []
    const tz = ctx.options.value.timeZone
    const busy = segmentByDay(partitioned.value.timed, days, tz, dayOffset.value)
      .flat()
      .map((s) => ({ start: s.startMinute, end: s.endMinute }))
    return emptyStretches(busy, dayStartMinute, dayEndMinute, foldMinutes, slotDuration)
  })

  /** A folded stretch takes up one slot; this maps minutes to where they are drawn. */
  const timeMap = computed(() => {
    const list = folds.value
    const { slotDuration, dayStartMinute, dayEndMinute } = cfg.value
    const toVisual = (minute: number) => {
      let v = minute
      for (const f of list) {
        if (minute >= f.end) v -= f.end - f.start - slotDuration
        else if (minute > f.start)
          v -= ((minute - f.start) / (f.end - f.start)) * (f.end - f.start - slotDuration)
      }
      return v
    }
    const fromVisual = (visual: number) => {
      let m = visual
      for (const f of list) {
        const at = toVisual(f.start)
        if (visual >= at + slotDuration) m += f.end - f.start - slotDuration
        else if (visual > at) {
          return f.start + ((visual - at) / slotDuration) * (f.end - f.start)
        }
      }
      return m
    }
    return {
      toVisual,
      fromVisual,
      start: toVisual(dayStartMinute),
      end: toVisual(dayEndMinute),
    }
  })

  /** `verticalPosition`, on the folded scale. */
  function position(start: number, end: number) {
    const map = timeMap.value
    return verticalPosition(map.toVisual(start), map.toVisual(end), map.start, map.end)
  }

  const slots = computed<TimeGridSlotRow[]>(() => {
    const { slotDuration, slotLabelInterval, dayStartMinute, dayEndMinute } = cfg.value
    const { locale, hour12 } = ctx.options.value
    const label = (minute: number) => formatTimeOfDay(minute, locale, { hour12, compact: true })
    const out: TimeGridSlotRow[] = []
    for (const slot of buildTimeSlots(dayStartMinute, dayEndMinute, slotDuration)) {
      const fold = folds.value.find((f) => slot.startMinute >= f.start && slot.startMinute < f.end)
      if (fold) {
        if (slot.startMinute === fold.start) {
          out.push({
            startMinute: fold.start,
            endMinute: fold.end,
            isLabelled: true,
            label: label(fold.start),
            isFold: true,
          })
        }
        continue
      }
      const isLabelled = slot.startMinute % slotLabelInterval === 0
      out.push({
        ...slot,
        isLabelled,
        label: isLabelled ? label(slot.startMinute) : '',
        isFold: false,
      })
    }
    return out
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

  /** All-day spans in column units, split per resource column group. */
  function allDaySpans(occurrences: readonly EventOccurrence<T>[]) {
    const { days } = cfg.value
    const tz = ctx.options.value.timeZone
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
    return spans
  }

  /** The all-day row without the drag preview, so dragging never re-packs the other events. */
  const allDayBase = computed(() => {
    const spans = allDaySpans(partitioned.value.allDay)
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
      mirror: false,
    }))
    return { items, rowCount: layout.rowCount }
  })

  /**
   * The all-day row with the drag preview drawn over it: in the row of the original, or the first
   * row. The row never grows or re-packs while dragging, so nothing jumps vertically.
   */
  const allDay = computed(() => {
    const base = allDayBase.value
    const m = mirror.value
    if (!m?.inAllDayRow) return base
    const occ = m.occurrence as unknown as EventOccurrence<T>
    const source = base.items.find((i) => i.occurrence.key === m.occurrence.sourceKey)
    const previews = allDaySpans([occ]).map((s): AllDayEventLayout<T> => ({
      key: `${occ.key}@${s.startCol}`,
      occurrence: occ,
      startCol: s.startCol,
      endCol: s.endCol,
      row: source?.row ?? 0,
      isStart: s.isStart,
      isEnd: s.isEnd,
      mirror: true,
    }))
    return { items: [...base.items, ...previews], rowCount: base.rowCount }
  })

  /**
   * Blocks drawn over the columns without taking part in the overlap layout: the drag preview of
   * a timed event and a timed selection.
   */
  const overlays = computed<TimeGridOverlay[][]>(() => {
    const { days } = cfg.value
    const tz = ctx.options.value.timeZone
    const result: TimeGridOverlay[][] = columns.value.map(() => [])
    const place = (
      occ: EventOccurrence<unknown>,
      kind: TimeGridOverlay['kind'],
      valid: boolean,
    ) => {
      groups.value.forEach((resource, g) => {
        if (resource && occ.resourceIds && !occ.resourceIds.includes(resource.id)) return
        segmentByDay([occ], days, tz, dayOffset.value).forEach((segments, d) => {
          const col = colIndex(d, g)
          for (const segment of segments) {
            const pos = position(segment.startMinute, segment.endMinute)
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

  /** Last layout per column, reused while its events and the settings stay the same. */
  const layoutCache = new Map<string, { signature: unknown[]; layouts: TimedEventLayout<T>[] }>()

  const timed = computed<TimedEventLayout<T>[][]>(() => {
    const { days, layout, dayStartMinute, dayEndMinute, slotDuration } = cfg.value
    const tz = ctx.options.value.timeZone
    const result: TimedEventLayout<T>[][] = columns.value.map(() => [])
    perGroup(partitioned.value.timed).forEach((list, g) => {
      segmentByDay(list, days, tz, dayOffset.value).forEach((segments, d) => {
        const col = colIndex(d, g)
        const cacheKey = columns.value[col]!.key
        const signature = [
          layout,
          timeMap.value,
          dayStartMinute,
          dayEndMinute,
          slotDuration,
          col,
          ...segments.flatMap((s) => [s.occurrence.event, s.startMinute, s.endMinute]),
        ]
        const cached = layoutCache.get(cacheKey)
        if (
          cached &&
          cached.signature.length === signature.length &&
          cached.signature.every((v, i) => v === signature[i])
        ) {
          result[col] = cached.layouts
          return
        }
        const visible: { segment: DaySegment<T>; top: number; height: number }[] = []
        for (const segment of segments) {
          const pos = position(segment.startMinute, segment.endMinute)
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
        layoutCache.set(cacheKey, { signature, layouts: result[col]! })
      })
    })
    return result
  })

  /** Overlapping events in a column taken together, per column, with `stackThreshold`. */
  const expandedStacks = shallowRef<ReadonlySet<string>>(new Set())
  const stacked = computed(() => {
    // One event is no stack, so 1 means the same as 2.
    const threshold = cfg.value.stackThreshold && Math.max(2, cfg.value.stackThreshold)
    const empty = timed.value.map(() => ({
      items: [] as TimedEventLayout<T>[],
      stacks: [] as EventStack<T>[],
    }))
    return timed.value.map((list, col) => {
      if (!threshold || list.length < threshold) return { items: list, stacks: empty[col]!.stacks }
      const sorted = [...list].sort((a, b) => a.top - b.top)
      const items: TimedEventLayout<T>[] = []
      const stacks: EventStack<T>[] = []
      let group: TimedEventLayout<T>[] = []
      let bottom = -Infinity
      const close = () => {
        const key = `${col}:${group[0]?.key}`
        if (group.length >= threshold && !expandedStacks.value.has(key)) {
          stacks.push({
            key,
            top: group[0]!.top,
            height: bottom - group[0]!.top,
            occurrences: group.map((g) => g.segment.occurrence),
          })
        } else items.push(...group)
      }
      for (const item of sorted) {
        if (item.top >= bottom) {
          close()
          group = []
          bottom = -Infinity
        }
        group.push(item)
        bottom = Math.max(bottom, item.top + item.height)
      }
      close()
      return { items, stacks }
    })
  })

  function expandStack(key: string) {
    expandedStacks.value = new Set(expandedStacks.value).add(key)
  }

  /** Events entirely before or after the visible hours, per column. */
  const hiddenEvents = computed(() => {
    const { days, dayStartMinute, dayEndMinute } = cfg.value
    const tz = ctx.options.value.timeZone
    const result = columns.value.map(() => ({
      before: [] as EventOccurrence<T>[],
      after: [] as EventOccurrence<T>[],
    }))
    if (dayStartMinute === 0 && dayEndMinute === 1440) return result
    perGroup(partitioned.value.timed).forEach((list, g) => {
      segmentByDay(list, days, tz, dayOffset.value).forEach((segments, d) => {
        const col = colIndex(d, g)
        for (const s of segments) {
          if (s.endMinute <= dayStartMinute) result[col]!.before.push(s.occurrence)
          else if (s.startMinute >= dayEndMinute) result[col]!.after.push(s.occurrence)
        }
      })
    })
    return result
  })

  /** Where to draw the now line, or `null` when today is not visible. */
  const nowLine = computed(() => {
    const now = ctx.now.value
    const { dayStartMinute, dayEndMinute } = cfg.value
    // Early in the morning, a day running past midnight is still yesterday's column.
    const lateNight = dayOffset.value > 0 && minutesIntoDay(now) < dayOffset.value
    const date = lateNight ? now.toPlainDate().subtract({ days: 1 }) : now.toPlainDate()
    const columnIndexes = columns.value.flatMap((c, i) => (c.date.equals(date) ? [i] : []))
    if (!columnIndexes.length) return null
    const minute = minutesIntoDay(now) + (lateNight ? 1440 : 0)
    if (minute < dayStartMinute || minute > dayEndMinute) return null
    return {
      columnIndex: columnIndexes[0]!,
      columnIndexes,
      top:
        (timeMap.value.toVisual(minute) - timeMap.value.start) /
        (timeMap.value.end - timeMap.value.start),
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

  // Only the columns of the current range stay in the cache.
  watch(columns, (list) => {
    const keys = new Set(list.map((c) => c.key))
    for (const key of layoutCache.keys()) if (!keys.has(key)) layoutCache.delete(key)
  })

  return {
    stacked,
    expandStack,
    timeMap,
    hiddenEvents,
    columns,
    slots,
    allDay,
    timed,
    overlays,
    allDaySelection,
    nowLine,
    slotRange,
    dayRange,
  }
}
