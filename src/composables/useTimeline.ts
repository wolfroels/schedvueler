import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  Temporal,
  createTimelineAxis,
  formatDate,
  formatTimeOfDay,
  groupByResource,
  layoutTimelineRow,
  withTimes,
  zonedAtMinute,
  type EventOccurrence,
  type ResourceNode,
  type TimelineItem,
} from '../core'
import type { SchedulerContext } from './context'

export interface TimelineConfig {
  days: readonly Temporal.PlainDate[]
  /** Rows, top to bottom. */
  resources: readonly ResourceNode<unknown>[]
  /** Minutes per column; 1440 or more gives one column per day. */
  slotDuration: number
  /** Minutes between slot labels. */
  slotLabelInterval: number
  dayStartMinute: number
  dayEndMinute: number
  /** Row sizes in px. */
  eventHeight: number
  laneGap: number
  rowPadding: number
  rowMinHeight: number
  /** Minimum event width as a fraction of the axis, so short events stay visible. */
  minEventWidth?: number
}

export interface TimelineDay {
  key: string
  date: Temporal.PlainDate
  label: string
  isToday: boolean
  isPast: boolean
  isWeekend: boolean
}

export interface TimelineSlotLabel {
  minute: number
  label: string
}

export interface TimelineRow<T> {
  key: string
  resource: ResourceNode<unknown>
  items: TimelineItem<T>[]
  laneCount: number
  /** Row height in px and offset from the top of the rows. */
  height: number
  top: number
}

/** A drag preview or selection drawn on a row. */
export interface TimelineOverlay {
  kind: 'mirror' | 'selection'
  occurrence: EventOccurrence<unknown>
  left: number
  width: number
  valid: boolean
}

/**
 * Headless timeline layout: the time axis, day and slot headings, one row per resource with its
 * events in stacked lanes, and the drag preview / selection per row.
 */
export function useTimeline<T>(ctx: SchedulerContext<T>, config: MaybeRefOrGetter<TimelineConfig>) {
  const cfg = computed(() => toValue(config))
  const daySlots = computed(() => cfg.value.slotDuration >= 1440)

  const axis = computed(() => {
    const { days, dayStartMinute, dayEndMinute } = cfg.value
    return daySlots.value
      ? createTimelineAxis(days, ctx.options.value.timeZone)
      : createTimelineAxis(days, ctx.options.value.timeZone, dayStartMinute, dayEndMinute)
  })

  const days = computed<TimelineDay[]>(() => {
    const { locale } = ctx.options.value
    const today = ctx.today.value
    const format: Intl.DateTimeFormatOptions = daySlots.value
      ? { weekday: 'short', day: 'numeric' }
      : { weekday: 'long', day: 'numeric', month: 'long' }
    return cfg.value.days.map((date) => {
      const cmp = Temporal.PlainDate.compare(date, today)
      return {
        key: date.toString(),
        date,
        label: formatDate(date, locale, format),
        isToday: cmp === 0,
        isPast: cmp < 0,
        isWeekend: date.dayOfWeek >= 6,
      }
    })
  })

  /** Slot columns within one day; a single column for day slots. */
  const slots = computed<TimelineSlotLabel[]>(() => {
    if (daySlots.value) return [{ minute: 0, label: '' }]
    const { slotDuration, slotLabelInterval } = cfg.value
    const { dayStartMinute, dayEndMinute } = axis.value
    const { locale, hour12 } = ctx.options.value
    const out: TimelineSlotLabel[] = []
    for (let m = dayStartMinute; m < dayEndMinute; m += slotDuration) {
      out.push({
        minute: m,
        label:
          m % slotLabelInterval === 0 ? formatTimeOfDay(m, locale, { hour12, compact: true }) : '',
      })
    }
    return out
  })

  const slotCount = computed(() => cfg.value.days.length * slots.value.length)

  const rowHeight = (lanes: number) => {
    const { eventHeight, laneGap, rowPadding, rowMinHeight } = cfg.value
    const content = lanes ? lanes * eventHeight + (lanes - 1) * laneGap : 0
    return Math.max(rowMinHeight, content + rowPadding * 2)
  }

  const rows = computed<TimelineRow<T>[]>(() => {
    const byResource = groupByResource(ctx.occurrences.value)
    const a = axis.value
    let top = 0
    return cfg.value.resources.map((resource) => {
      const { items, laneCount } = layoutTimelineRow(
        byResource.get(resource.id) ?? [],
        a,
        cfg.value.minEventWidth,
      )
      const height = rowHeight(laneCount)
      const row = { key: String(resource.id), resource, items, laneCount, height, top }
      top += height
      return row
    })
  })

  const totalHeight = computed(() => {
    const list = rows.value
    const last = list[list.length - 1]
    return last ? last.top + last.height : 0
  })

  /** Index of the row at `offset` px from the top of the rows (clamped). */
  function rowAt(offset: number): number {
    const list = rows.value
    let lo = 0
    let hi = list.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (list[mid]!.top <= offset) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  /** Drag preview and selection, per resource id. */
  const overlays = computed(() => {
    const map = new Map<unknown, TimelineOverlay[]>()
    const a = axis.value
    const add = (occ: EventOccurrence<unknown>, kind: TimelineOverlay['kind'], valid: boolean) => {
      const left = a.position(occ.startMs)
      const right = a.position(occ.endMs)
      if (right <= left) return
      for (const id of occ.resourceIds ?? []) {
        const list = map.get(id) ?? []
        list.push({ kind, occurrence: occ, left, width: right - left, valid })
        map.set(id, list)
      }
    }
    const m = ctx.interaction.mirror.value
    if (m) add(m, 'mirror', m.valid)
    const sel = ctx.interaction.selection.value
    if (sel)
      add(withTimes({ key: 'selection' } as EventOccurrence<unknown>, sel.times), 'selection', true)
    return map
  })

  /** Where to draw the now line, as a fraction of the axis, or `null` when not visible. */
  const nowPosition = computed(() => {
    const ms = ctx.now.value.epochMilliseconds
    const a = axis.value
    if (ms < a.startMs || ms >= a.endMs) return null
    return a.position(ms)
  })

  /** The slot at a position on the axis: its start and end, and whether it is a whole day. */
  function slotAt(fraction: number) {
    const tz = ctx.options.value.timeZone
    const { date, minute } = axis.value.at(fraction)
    if (daySlots.value) {
      return {
        date,
        start: date.toZonedDateTime({ timeZone: tz }),
        end: date.add({ days: 1 }).toZonedDateTime({ timeZone: tz }),
        allDay: true,
      }
    }
    const { slotDuration } = cfg.value
    const startMinute = Math.floor(minute / slotDuration) * slotDuration
    return {
      date,
      start: zonedAtMinute(date, startMinute, tz),
      end: zonedAtMinute(date, startMinute + slotDuration, tz),
      allDay: false,
    }
  }

  return {
    axis,
    days,
    slots,
    slotCount,
    daySlots,
    rows,
    totalHeight,
    rowAt,
    overlays,
    nowPosition,
    slotAt,
  }
}
