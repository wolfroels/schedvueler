/** Anything with a half-open `[start, end)` extent: day columns, minutes or epoch ms. */
export interface Interval {
  start: number
  end: number
}

/** Indices of `items` sorted by start, longest first on ties, then by original index. */
export function sortedIndices(items: readonly Interval[]): number[] {
  return items
    .map((_, i) => i)
    .sort((a, b) => {
      const x = items[a]!
      const y = items[b]!
      return x.start - y.start || y.end - y.start - (x.end - x.start) || a - b
    })
}

export interface LanePacking {
  /** Lane (row) of each item, in input order. */
  lanes: number[]
  laneCount: number
}

/**
 * Greedy first-fit packing: each item goes into the first lane that is free when it starts.
 * Used for timeline rows and as the base for day-grid rows.
 */
export function packLanes(items: readonly Interval[]): LanePacking {
  const laneEnds: number[] = []
  const lanes: number[] = Array.from({ length: items.length }, () => 0)
  for (const i of sortedIndices(items)) {
    const item = items[i]!
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = Math.max(item.end, item.start)
    lanes[i] = lane
  }
  return { lanes, laneCount: laneEnds.length }
}

export interface DayGridRowOptions {
  /**
   * Rows available per day cell, including the row used by the "+N more" link.
   * Unlimited when omitted.
   */
  maxRows?: number
}

export interface DayGridRowLayout {
  /** Row of each span in input order, or -1 when it is hidden behind "+N more". */
  rows: number[]
  /** Rows in use after hiding. */
  rowCount: number
  /** Hidden spans per column. */
  hiddenPerColumn: number[]
}

/**
 * Lays out horizontal spans in one week row (month view, all-day row).
 * Spans use column indices: `start` is the first column, `end` the column after the last.
 * When a column needs more rows than `maxRows`, its last row is given to a "+N more" link.
 */
export function layoutDayGridRow(
  spans: readonly Interval[],
  columns: number,
  options: DayGridRowOptions = {},
): DayGridRowLayout {
  const { lanes } = packLanes(spans)
  const needed: number[] = Array.from({ length: columns }, () => 0)
  spans.forEach((span, i) => {
    for (let c = span.start; c < span.end; c++) needed[c] = Math.max(needed[c]!, lanes[i]! + 1)
  })

  const max = options.maxRows
  const limit = needed.map((n) => (max === undefined || n <= max ? Infinity : Math.max(0, max - 1)))
  const hiddenPerColumn: number[] = Array.from({ length: columns }, () => 0)
  let rowCount = 0
  const rows = spans.map((span, i) => {
    const lane = lanes[i]!
    let visible = true
    for (let c = span.start; c < span.end; c++) if (lane >= limit[c]!) visible = false
    if (visible) {
      rowCount = Math.max(rowCount, lane + 1)
      return lane
    }
    for (let c = span.start; c < span.end; c++) hiddenPerColumn[c]!++
    return -1
  })
  return { rows, rowCount, hiddenPerColumn }
}
