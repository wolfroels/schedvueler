import { sortedIndices, type Interval } from './lanes'

/** Horizontal placement of an event inside a day column of the time grid. */
export interface TimeGridPlacement {
  /** Column within its overlap group. */
  column: number
  /** Columns in its overlap group. */
  columns: number
  /** Columns taken after expanding into free space on the right. */
  span: number
  /** Position and size as fractions of the day column width (0-1). */
  left: number
  width: number
  /** Paint order: events that start later sit on top. */
  order: number
}

export interface TimeGridLayoutOptions {
  /**
   * Events shorter than this (same unit as the items, usually minutes) are treated as this long
   * when deciding what overlaps, so they keep room for their minimum rendered height.
   */
  minDuration?: number
}

/** Pluggable overlap algorithm. Receives items in any order, returns placements in input order. */
export type TimeGridLayoutAlgorithm = (
  items: readonly Interval[],
  options?: TimeGridLayoutOptions,
) => TimeGridPlacement[]

interface Group {
  members: number[]
  columnOf: Map<number, number>
  columns: number[][]
}

/** Splits items into groups of transitively overlapping items and assigns first-fit columns. */
function groupColumns(
  items: readonly Interval[],
  minDuration: number,
): { groups: Group[]; ends: number[] } {
  const ends = items.map((it) => Math.max(it.end, it.start + minDuration))
  const groups: Group[] = []
  let current: Group | undefined
  let currentEnd = -Infinity
  for (const i of sortedIndices(items)) {
    const start = items[i]!.start
    if (!current || start >= currentEnd) {
      current = { members: [], columnOf: new Map(), columns: [] }
      groups.push(current)
      currentEnd = -Infinity
    }
    let col = current.columns.findIndex((column) => ends[column[column.length - 1]!]! <= start)
    if (col < 0) {
      col = current.columns.length
      current.columns.push([])
    }
    current.columns[col]!.push(i)
    current.columnOf.set(i, col)
    current.members.push(i)
    currentEnd = Math.max(currentEnd, ends[i]!)
  }
  return { groups, ends }
}

/**
 * Side-by-side columns (Google Calendar / Outlook style). Each event takes an equal column and
 * expands to the right while the neighbouring columns are free during its time.
 */
export const columnsLayout: TimeGridLayoutAlgorithm = (items, options = {}) => {
  const { groups, ends } = groupColumns(items, options.minDuration ?? 0)
  const out: TimeGridPlacement[] = []
  let order = 0
  for (const group of groups) {
    const columns = group.columns.length
    for (const i of group.members) {
      const column = group.columnOf.get(i)!
      const start = items[i]!.start
      const end = ends[i]!
      let span = 1
      for (let c = column + 1; c < columns; c++) {
        const blocked = group.columns[c]!.some((j) => items[j]!.start < end && ends[j]! > start)
        if (blocked) break
        span++
      }
      out[i] = {
        column,
        columns,
        span,
        left: column / columns,
        width: span / columns,
        order: order++,
      }
    }
  }
  return out
}

/**
 * Cascading layout: overlapping events are offset and drawn on top of each other, each running to
 * the right edge. Keeps text readable when many events overlap in a narrow column.
 */
export function createStackLayout(offset = 0.15): TimeGridLayoutAlgorithm {
  return (items, options = {}) => {
    const { groups } = groupColumns(items, options.minDuration ?? 0)
    const out: TimeGridPlacement[] = []
    let order = 0
    for (const group of groups) {
      const columns = group.columns.length
      const step = Math.min(offset, columns > 1 ? 0.75 / (columns - 1) : 0)
      for (const i of group.members) {
        const column = group.columnOf.get(i)!
        const left = column * step
        out[i] = { column, columns, span: 1, left, width: 1 - left, order: order++ }
      }
    }
    return out
  }
}

export const stackLayout = createStackLayout()

/** Built-in algorithms by name. */
export const timeGridLayouts = {
  columns: columnsLayout,
  stack: stackLayout,
} satisfies Record<string, TimeGridLayoutAlgorithm>

export interface TimeSlot {
  startMinute: number
  endMinute: number
}

/** Rows of the time axis, e.g. 30-minute slots from 08:00 to 18:00. */
export function buildTimeSlots(startMinute = 0, endMinute = 1440, slotMinutes = 30): TimeSlot[] {
  if (slotMinutes <= 0) throw new RangeError('slotMinutes must be positive')
  const slots: TimeSlot[] = []
  for (let m = startMinute; m < endMinute; m += slotMinutes) {
    slots.push({ startMinute: m, endMinute: Math.min(m + slotMinutes, endMinute) })
  }
  return slots
}

/**
 * Vertical position of a segment as fractions of the visible time range, clipped to it.
 * Returns `null` when the segment is entirely outside the range.
 */
export function verticalPosition(
  startMinute: number,
  endMinute: number,
  rangeStartMinute = 0,
  rangeEndMinute = 1440,
): { top: number; height: number } | null {
  const total = rangeEndMinute - rangeStartMinute
  const start = Math.max(startMinute, rangeStartMinute)
  const end = Math.min(endMinute, rangeEndMinute)
  if (end < start || start >= rangeEndMinute || (end === start && start < rangeStartMinute))
    return null
  return { top: (start - rangeStartMinute) / total, height: (end - start) / total }
}
