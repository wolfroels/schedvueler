import {
  dayStrategy,
  formatDate,
  formatDateRange,
  monthStrategy,
  weekStrategy,
  type RangeStrategy,
  type ResourceId,
  type VisibleRange,
} from '../core'
import type { EventLayoutOption } from '../types'

/** Width limits that make a view responsive. */
export interface ResponsiveViewProps {
  /** Only offer this view while the scheduler is at least this wide (px). */
  minWidth?: number
  /** Only offer this view while the scheduler is at most this wide (px). */
  maxWidth?: number
}

/** Props shared by the time-grid views. Unset props fall back to the `<Scheduler>` option. */
export interface TimeGridViewProps extends ResponsiveViewProps {
  /** Unique view name, used by `v-model:view`. */
  name?: string
  /** Text in the view switcher. */
  label?: string
  slotDuration?: number
  slotLabelInterval?: number
  dayStartTime?: string
  dayEndTime?: string
  scrollTime?: string
  hiddenDays?: readonly number[]
  /** Show the all-day row. Default true. */
  allDaySlot?: boolean
  eventLayout?: EventLayoutOption
  /**
   * Show a column per resource (for each day): `true` for all resources without children, or
   * a list of resource ids. Events show in the columns of their resources.
   */
  resources?: boolean | readonly ResourceId[]
  /** Column order with resources: days within each resource (default) or resources within each day. */
  groupBy?: 'resource' | 'date'
}

/** Props of `<TimelineView>`. */
export interface TimelineViewProps extends ResponsiveViewProps {
  name?: string
  label?: string
  /** Period covered. Default "day". */
  period?: ViewPeriod
  /** Number of consecutive days from the date; overrides `period`. */
  days?: number
  /** Minutes per column. 1440 gives one column per day. Default 60 for a day, else 1440. */
  slotDuration?: number
  /** Minutes between slot labels. Default 60 (or the slot when longer). */
  slotLabelInterval?: number
  /** Minutes that drags snap to. Defaults to the scheduler's `snapDuration`, or a day for day columns. */
  snapDuration?: number
  /** Visible hours per day with sub-day slots, "HH:mm". */
  dayStartTime?: string
  dayEndTime?: string
  /** Time scrolled into view on open (sub-day slots), "HH:mm". */
  scrollTime?: string
  hiddenDays?: readonly number[]
  /** Width of one slot column in px; columns stretch when there is room. Default 64, or 120 for days. */
  slotWidth?: number
  /** Width of the resource column, any CSS length. */
  resourceAreaWidth?: string
  /** Height of an event bar in px. Default 28. */
  eventHeight?: number
  /** Minimum row height in px. Default 44. */
  rowMinHeight?: number
  /** Only show these resources (in tree order). */
  resourceIds?: readonly ResourceId[]
  /** Render only the visible rows. Default true. */
  virtual?: boolean
}

/** Timeline settings after defaults, as passed to `<Timeline>`. */
export interface TimelineSettings {
  slotDuration: number
  slotLabelInterval?: number
  snapDuration: number
  dayStartTime?: string
  dayEndTime?: string
  scrollTime?: string
  slotWidth: number
  resourceAreaWidth?: string
  eventHeight: number
  rowMinHeight: number
  resourceIds?: readonly ResourceId[]
  virtual: boolean
}

export function singleDayTitle(range: VisibleRange, locale: string): string {
  return formatDate(range.start, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function multiDayTitle(range: VisibleRange, locale: string): string {
  return formatDateRange(range.start, range.end.subtract({ days: 1 }), locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function monthTitle(range: VisibleRange, locale: string): string {
  return formatDate(range.active.start, locale, { month: 'long', year: 'numeric' })
}

/** Period covered by list-like views (agenda, timeline). */
export type ViewPeriod = 'day' | 'week' | 'month'

/** The month itself, without the padding weeks of the month grid. */
function wholeMonth(): RangeStrategy {
  const month = monthStrategy()
  return {
    range(anchor) {
      const { active } = month.range(anchor)
      return { ...active, active }
    },
    step: month.step,
  }
}

/** Range strategy and title for a period, or for `days` consecutive days when set. */
export function periodView(period: ViewPeriod, days: number | undefined, weekStart: number) {
  if (days) return { strategy: dayStrategy({ days }), title: multiDayTitle }
  if (period === 'day') return { strategy: dayStrategy(), title: singleDayTitle }
  if (period === 'month') return { strategy: wholeMonth(), title: monthTitle }
  return { strategy: weekStrategy({ weekStart }), title: multiDayTitle }
}
