import { describe, expect, it } from 'vitest'
import {
  buildTimeSlots,
  columnsLayout,
  layoutDayGridRow,
  packLanes,
  stackLayout,
  verticalPosition,
} from '../layout'

const iv = (start: number, end: number) => ({ start, end })

describe('columnsLayout', () => {
  it('gives non-overlapping events the full width', () => {
    const out = columnsLayout([iv(0, 60), iv(60, 120)])
    expect(out.map((p) => [p.left, p.width])).toEqual([
      [0, 1],
      [0, 1],
    ])
  })

  it('splits overlapping events into columns', () => {
    const out = columnsLayout([iv(0, 120), iv(30, 90), iv(60, 150)])
    expect(out.map((p) => [p.column, p.columns])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ])
  })

  it('reuses a column once it frees up and expands into free space', () => {
    // A: 0-60 col 0, B: 0-120 col 1, C: 60-90 reuses col 0.
    // D: 100-130 sits in col 0 while col 1 (B) is still busy, so it cannot expand.
    const out = columnsLayout([iv(0, 60), iv(0, 120), iv(60, 90), iv(100, 130)])
    expect(out.map((p) => [p.column, p.span, p.width])).toEqual([
      [1, 1, 0.5],
      [0, 1, 0.5],
      [1, 1, 0.5],
      [1, 1, 0.5],
    ])
  })

  it('expands an event across later columns that are free during its time', () => {
    const out = columnsLayout([iv(0, 180), iv(0, 60), iv(0, 60), iv(90, 120)])
    // The long event sorts first into col 0; the 90-120 event reuses col 1 and expands into col 2.
    expect(out[3]).toMatchObject({ column: 1, columns: 3, span: 2 })
    expect(out[3]!.width).toBeCloseTo(2 / 3)
  })

  it('treats very short events as minDuration long', () => {
    const tight = columnsLayout([iv(0, 5), iv(10, 40)])
    expect(tight.map((p) => p.columns)).toEqual([1, 1])
    const padded = columnsLayout([iv(0, 5), iv(10, 40)], { minDuration: 30 })
    expect(padded.map((p) => p.columns)).toEqual([2, 2])
  })

  it('lays out 2 000 events in a column quickly', () => {
    const items = Array.from({ length: 2000 }, (_, i) =>
      iv((i * 7) % 1400, ((i * 7) % 1400) + 30 + (i % 5) * 15),
    )
    const t = performance.now()
    columnsLayout(items)
    expect(performance.now() - t).toBeLessThan(200)
  })
})

describe('stackLayout', () => {
  it('cascades overlapping events to the right edge', () => {
    const out = stackLayout([iv(0, 60), iv(15, 75)])
    expect(out[0]).toMatchObject({ left: 0, width: 1 })
    expect(out[1]!.left).toBeCloseTo(0.15)
    expect(out[1]!.width).toBeCloseTo(0.85)
  })
})

describe('packLanes', () => {
  it('first-fit packs intervals', () => {
    expect(packLanes([iv(0, 3), iv(1, 2), iv(2, 5), iv(3, 4)])).toEqual({
      lanes: [0, 1, 1, 0],
      laneCount: 2,
    })
  })
})

describe('layoutDayGridRow', () => {
  it('stacks spans and puts the rest behind "+N more"', () => {
    const spans = [iv(0, 3), iv(1, 2), iv(1, 2), iv(1, 2), iv(4, 5)]
    const out = layoutDayGridRow(spans, 7, { maxRows: 3 })
    // Column 1 needs 4 rows but has 3: two rows of events plus the "+N more" row.
    expect(out.rows).toEqual([0, 1, -1, -1, 0])
    expect(out.hiddenPerColumn).toEqual([0, 2, 0, 0, 0, 0, 0])
    expect(out.rowCount).toBe(2)
  })

  it('shows everything when it fits', () => {
    const out = layoutDayGridRow([iv(0, 2), iv(1, 3)], 7, { maxRows: 2 })
    expect(out.rows).toEqual([0, 1])
    expect(out.hiddenPerColumn.every((n) => n === 0)).toBe(true)
  })
})

describe('time axis helpers', () => {
  it('builds slots and positions segments', () => {
    expect(buildTimeSlots(480, 600, 45)).toEqual([
      { startMinute: 480, endMinute: 525 },
      { startMinute: 525, endMinute: 570 },
      { startMinute: 570, endMinute: 600 },
    ])
    expect(verticalPosition(540, 600, 480, 1080)).toEqual({ top: 0.1, height: 0.1 })
    expect(verticalPosition(420, 500, 480, 1080)).toEqual({ top: 0, height: 20 / 600 })
    expect(verticalPosition(1100, 1200, 480, 1080)).toBeNull()
  })
})
