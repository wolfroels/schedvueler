import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import {
  buildResourceTree,
  defaultResourceAccessors,
  filterResourceTree,
  reorderResources,
  shiftResourceIds,
} from '../resources'
import { dependencyLinks, headerTiers, loadPerDay } from '../timeline-tools'
import { createAccessors, type EventOccurrence, type SchedulerEvent } from '../types'

const nodes = buildResourceTree(
  [
    { id: 'a', title: 'Alpha' },
    { id: 'a1', title: 'Crane', parentId: 'a' },
    { id: 'a2', title: 'Truck', parentId: 'a' },
    { id: 'b', title: 'Beta' },
  ],
  defaultResourceAccessors,
)

describe('resource helpers', () => {
  it('sorts siblings when asked', () => {
    const sorted = buildResourceTree(
      [
        { id: 'b', title: 'B' },
        { id: 'a', title: 'A' },
      ],
      defaultResourceAccessors,
      (x, y) => x.title!.localeCompare(y.title!),
    )
    expect(sorted.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('filters and keeps the parents of matches', () => {
    expect(filterResourceTree(nodes, (n) => n.title === 'Truck').map((n) => n.id)).toEqual([
      'a',
      'a2',
    ])
  })

  it('reorders', () => {
    const list = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const id = (r: { id: number }) => r.id
    expect(reorderResources(list, id, 3, 1, 'before').map(id)).toEqual([3, 1, 2])
    expect(reorderResources(list, id, 1, 3, 'after').map(id)).toEqual([2, 3, 1])
    expect(reorderResources(list, id, 1, 1, 'after')).toBe(list)
  })

  it('shifts all resources by the same number of rows', () => {
    const order = ['r1', 'r2', 'r3', 'r4']
    expect(shiftResourceIds(['r1', 'r2'], 'r1', 'r3', order)).toEqual(['r3', 'r4'])
    // Would fall off the end: stays where it is.
    expect(shiftResourceIds(['r3', 'r4'], 'r3', 'r4', order)).toEqual(['r3', 'r4'])
  })
})

const BXL = 'Europe/Brussels'
const d = (s: string) => Temporal.PlainDate.from(s)
const occ = (id: string, start: string, end: string, extra: Partial<SchedulerEvent> = {}) => {
  const s = Temporal.PlainDateTime.from(start).toZonedDateTime(BXL)
  const e = Temporal.PlainDateTime.from(end).toZonedDateTime(BXL)
  return {
    key: id,
    id,
    event: { id, start, ...extra },
    start: s,
    end: e,
    startMs: s.epochMilliseconds,
    endMs: e.epochMilliseconds,
    allDay: false,
    resourceIds: [],
    recurring: false,
    isException: false,
  } as unknown as EventOccurrence<SchedulerEvent>
}

describe('timeline helpers', () => {
  it('adds up the load per day, across midnight', () => {
    const load = loadPerDay(
      [
        occ('a', '2026-06-15T22:00', '2026-06-16T02:00'),
        occ('b', '2026-06-16T09:00', '2026-06-16T10:00'),
      ],
      [d('2026-06-15'), d('2026-06-16')],
      BXL,
    )
    expect(load.map((l) => l.minutes)).toEqual([120, 180])
    expect(load[1]!.occurrences).toHaveLength(2)
  })

  it('groups days into header tiers', () => {
    const days = Array.from({ length: 40 }, (_, i) => d('2026-06-20').add({ days: i }))
    const months = headerTiers(days, 'month', 'en-GB', 1)
    expect(months.map((g) => [g.label, g.span])).toEqual([
      ['June 2026', 11],
      ['July 2026', 29],
    ])
    const weeks = headerTiers(days.slice(0, 9), 'week', 'en-GB', 1)
    expect(weeks.map((g) => g.span)).toEqual([2, 7])
  })

  it('links events to what they depend on', () => {
    const a = occ('a', '2026-06-15T09:00', '2026-06-15T10:00')
    const b = occ('b', '2026-06-15T11:00', '2026-06-15T12:00', { dependsOn: ['a', 'missing'] })
    const links = dependencyLinks([a, b], createAccessors<SchedulerEvent>())
    expect(links).toEqual([{ key: 'a>b', from: a, to: b }])
  })
})
