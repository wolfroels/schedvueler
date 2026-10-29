import { formatDate, formatDateRange, type VisibleRange } from '../core'
import type { EventLayoutOption } from '../types'

/** Props shared by the time-grid views. Unset props fall back to the `<Scheduler>` option. */
export interface TimeGridViewProps {
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
