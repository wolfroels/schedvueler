import {
  dayStrategy,
  formatDate,
  formatDateRange,
  monthStrategy,
  weekStrategy,
  type RangeStrategy,
  type HeaderTierUnit,
  type ResourceId,
  type ResourceNode,
  type VisibleRange,
} from '../core'
import { parseTimeOfDay } from '../composables/context'
import type { EventLayoutOption, ResourceColumn } from '../types'

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
  /** Only show the scheduler's `work-days`. */
  workWeek?: boolean
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
  /** Render only the visible rows and events. Default true. */
  virtual?: boolean
  /** Rows above the days, from the top, e.g. `['month', 'week']`. */
  headerTiers?: readonly HeaderTierUnit[]
  /** With day columns: "compact" thin bars, or "count" a number per day for timed events. */
  dayEvents?: 'bars' | 'compact' | 'count'
  /** Named scales to zoom between, with Ctrl + scroll or `v-model:zoom`. */
  zoomLevels?: readonly TimelineZoomLevel[]
  /** Show a search box above the resources. */
  resourceSearch?: boolean
  /** More columns in the resource area. */
  resourceColumns?: readonly ResourceColumn[]
  /** The resource area can be resized by dragging its edge. */
  resourceAreaResizable?: boolean
  /** Rows can be dragged to another place; emits `resource-reorder`. */
  resourceReorder?: boolean
  /** Show how busy each row is per day. */
  load?: boolean | { capacity?: number | ((resource: ResourceNode<unknown>) => number) }
  /** Draw arrows between events with `dependsOn`. */
  dependencies?: boolean
}

export interface TimelineZoomLevel {
  label?: string
  slotDuration: number
  slotWidth: number
  slotLabelInterval?: number
  snapDuration?: number
  headerTiers?: readonly HeaderTierUnit[]
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
  /** One row per event, as in a Gantt chart. */
  byEvent?: boolean
  headerTiers?: readonly HeaderTierUnit[]
  dayEvents?: 'bars' | 'compact' | 'count'
  zoomLevels?: readonly TimelineZoomLevel[]
  zoomLevel?: number
  resourceSearch?: boolean
  resourceColumns?: readonly ResourceColumn[]
  resourceAreaResizable?: boolean
  resourceReorder?: boolean
  load?: boolean | { capacity?: number | ((resource: ResourceNode<unknown>) => number) }
  dependencies?: boolean
}

/** Whether a view's days run past midnight, so that it needs events from the day after. */
export function endsPastMidnight(dayEndTime: string | undefined, schedulerEnd: number): boolean {
  return parseTimeOfDay(dayEndTime, schedulerEnd) > 1440
}

/** The weekdays to hide for a view that only shows work days. */
export function notWorkDays(workDays: readonly number[] = [1, 2, 3, 4, 5]): number[] {
  return [1, 2, 3, 4, 5, 6, 7].filter((d) => !workDays.includes(d))
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
    keepsDayOfMonth: true,
  }
}

/** Range strategy and title for a period, or for `days` consecutive days when set. */
export function periodView(period: ViewPeriod, days: number | undefined, weekStart: number) {
  if (days) return { strategy: dayStrategy({ days }), title: multiDayTitle }
  if (period === 'day') return { strategy: dayStrategy(), title: singleDayTitle }
  if (period === 'month') return { strategy: wholeMonth(), title: monthTitle }
  return { strategy: weekStrategy({ weekStart }), title: multiDayTitle }
}
