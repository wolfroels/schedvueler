import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import { EventStore } from '../events'
import {
  computeMove,
  computeResize,
  computeSelection,
  type EventTimes,
  type Hit,
} from '../interaction'
import { applyEventEdit } from '../edit-events'
import { createTimelineAxis, layoutTimelineRow } from '../layout'
import { rangeToWindow, weekStrategy } from '../range'
import {
  buildResourceTree,
  defaultResourceAccessors,
  groupByResource,
  leafResources,
  moveResourceIds,
  visibleResources,
  type SchedulerResource,
} from '../resources'
import type { EventOccurrence, SchedulerEvent } from '../types'

const BXL = 'Europe/Brussels'
const d = (s: string) => Temporal.PlainDate.from(s)
const opts = { timeZone: BXL, snapMinutes: 15, defaultDurationMinutes: 60 }

function occurrences(
  events: SchedulerEvent[],
  week = '2026-10-26',
): EventOccurrence<SchedulerEvent>[] {
  const store = new EventStore(events, { timeZone: BXL })
  return store.query(rangeToWindow(weekStrategy().range(d(week)), BXL))
}
const one = (event: SchedulerEvent) => occurrences([event])[0]!

const fmt = (t: EventTimes | null) =>
  t &&
  (t.allDay
    ? `${t.start.toPlainDate()}..${t.end.toPlainDate()} all-day`
    : `${t.start.toPlainDateTime().toString({ smallestUnit: 'minute' })}..${t.end
        .toPlainDateTime()
        .toString({ smallestUnit: 'minute' })}`)

describe('resource tree', () => {
  const resources: SchedulerResource[] = [
    { id: 'crane-2', title: 'Crane 2', parentId: 'cranes' },
    { id: 'cranes', title: 'Cranes' },
    { id: 'crane-1', title: 'Crane 1', parentId: 'cranes' },
    { id: 'room', title: 'Room' },
    { id: 'orphan', parentId: 'missing' },
    { id: 'a', parentId: 'b' },
    { id: 'b', parentId: 'a' },
  ]
  const tree = buildResourceTree(resources, defaultResourceAccessors)

  it('orders depth first with children after their parent', () => {
    expect(tree.map((n) => `${'-'.repeat(n.depth)}${n.id}`)).toEqual([
      'cranes',
      '-crane-2',
      '-crane-1',
      'room',
      'orphan',
      'a',
      'b',
    ])
    expect(tree[0]!.childIds).toEqual(['crane-2', 'crane-1'])
    expect(tree.find((n) => n.id === 'orphan')!.title).toBe('orphan')
  })

  it('hides the descendants of collapsed nodes', () => {
    expect(visibleResources(tree, new Set(['cranes'])).map((n) => n.id)).toEqual([
      'cranes',
      'room',
      'orphan',
      'a',
      'b',
    ])
    expect(leafResources(tree).map((n) => n.id)).toEqual([
      'crane-2',
      'crane-1',
      'room',
      'orphan',
      'a',
      'b',
    ])
  })

  it('groups occurrences under each of their resources', () => {
    const groups = groupByResource([
      { id: 1, resourceIds: ['a', 'b'] },
      { id: 2, resourceIds: ['b'] },
      { id: 3, resourceIds: [] },
    ])
    expect(groups.get('a')!.map((o) => o.id)).toEqual([1])
    expect(groups.get('b')!.map((o) => o.id)).toEqual([1, 2])
  })

  it('moves an event between resources, keeping the others', () => {
    expect(moveResourceIds(['a', 'b'], 'a', 'c')).toEqual(['c', 'b'])
    expect(moveResourceIds(['a', 'b'], 'a', 'b')).toEqual(['b'])
    expect(moveResourceIds(['a'], 'a', undefined)).toEqual(['a'])
    expect(moveResourceIds([], 'x', 'c')).toEqual(['c'])
  })
})

describe('timeline axis', () => {
  const days = [d('2026-10-26'), d('2026-10-27')]
  const at = (s: string) => Temporal.ZonedDateTime.from(`${s}[${BXL}]`).epochMilliseconds

  it('maps wall-clock time to positions, with hidden hours collapsed', () => {
    const axis = createTimelineAxis(days, BXL, 8 * 60, 18 * 60)
    expect(axis.position(at('2026-10-26T08:00'))).toBe(0)
    expect(axis.position(at('2026-10-26T13:00'))).toBe(0.25)
    expect(axis.position(at('2026-10-26T20:00'))).toBe(0.5)
    expect(axis.position(at('2026-10-27T03:00'))).toBe(0.5)
    expect(axis.position(at('2026-10-30T03:00'))).toBe(1)
    expect(axis.at(0.75)).toEqual({ date: d('2026-10-27'), minute: 13 * 60 })
  })

  it('lays out a row with lanes and leaves out events in hidden hours', () => {
    const axis = createTimelineAxis(days, BXL, 8 * 60, 18 * 60)
    const occs = occurrences([
      { id: 1, start: '2026-10-26T09:00', end: '2026-10-26T11:00' },
      { id: 2, start: '2026-10-26T10:00', end: '2026-10-26T12:00' },
      { id: 3, start: '2026-10-26T11:00', end: '2026-10-26T12:00' },
      { id: 4, start: '2026-10-26T19:00', end: '2026-10-26T20:00' },
      { id: 5, start: '2026-10-20', end: '2026-10-27', allDay: true },
    ])
    const { items, laneCount } = layoutTimelineRow(occs, axis)
    const byId = Object.fromEntries(items.map((i) => [i.occurrence.id, i]))
    expect(Object.keys(byId).sort()).toEqual(['1', '2', '3', '5'])
    expect(byId[1]!.left).toBeCloseTo(0.05)
    expect(byId[1]!.width).toBeCloseTo(0.1)
    expect(byId[5]!.isStart).toBe(false)
    expect(byId[5]!.left).toBe(0)
    expect(byId[5]!.width).toBe(0.5)
    expect(laneCount).toBe(3)
    expect(byId[3]!.lane).toBe(1)
  })
})

describe('timeline and resource interaction', () => {
  const tl = (date: string, minute: number, resourceId?: string): Hit => ({
    zone: 'timeline',
    date: d(date),
    minute,
    resourceId,
  })
  const ev = one({ id: 1, start: '2026-10-27T09:10', end: '2026-10-27T10:10', resourceId: 'a' })

  it('moves timed events across days and resources on a timeline', () => {
    const out = computeMove(ev, tl('2026-10-27', 600, 'a'), tl('2026-10-28', 545, 'b'), opts)
    expect(fmt(out)).toBe('2026-10-28T08:10..2026-10-28T09:10')
    expect(out.resourceIds).toEqual(['b'])
  })

  it('keeps all-day events all-day and moves them by whole days', () => {
    const allDay = one({ id: 2, start: '2026-10-27', end: '2026-10-29' })
    const hourly = { ...opts, snapMinutes: 60 }
    expect(fmt(computeMove(allDay, tl('2026-10-27', 600), tl('2026-10-28', 300), hourly))).toBe(
      '2026-10-28..2026-10-30 all-day',
    )
    // Less than half a day: stays put.
    expect(fmt(computeMove(allDay, tl('2026-10-27', 600), tl('2026-10-27', 1200), hourly))).toBe(
      '2026-10-27..2026-10-29 all-day',
    )
    expect(
      fmt(computeResize(allDay, 'end', tl('2026-10-28', 600), tl('2026-10-30', 500), hourly)),
    ).toBe('2026-10-27..2026-10-31 all-day')
  })

  it('resizes timed events on a timeline by snapped minutes', () => {
    expect(fmt(computeResize(ev, 'end', tl('2026-10-27', 610), tl('2026-10-27', 700), opts))).toBe(
      '2026-10-27T09:10..2026-10-27T11:40',
    )
  })

  it('selects days on a day-slot timeline and keeps the resource', () => {
    const daily = { ...opts, snapMinutes: 1440 }
    const sel = computeSelection(tl('2026-10-29', 300, 'b'), tl('2026-10-27', 900, 'c'), daily)
    expect(fmt(sel)).toBe('2026-10-27..2026-10-30 all-day')
    expect(sel!.resourceIds).toEqual(['b'])
  })

  it('moves between resource columns in the time grid', () => {
    const out = computeMove(
      ev,
      { zone: 'time', date: d('2026-10-27'), minute: 570, resourceId: 'a' },
      { zone: 'time', date: d('2026-10-27'), minute: 570, resourceId: 'c' },
      opts,
    )
    expect(fmt(out)).toBe('2026-10-27T09:10..2026-10-27T10:10')
    expect(out.resourceIds).toEqual(['c'])
  })

  it('writes the new resources when applying an edit', () => {
    const events: SchedulerEvent[] = [
      { id: 1, start: '2026-10-27T09:10', end: '2026-10-27T10:10', resourceId: 'a' },
      {
        id: 2,
        start: '2026-10-26T09:00',
        end: '2026-10-26T10:00',
        rrule: 'FREQ=DAILY;COUNT=5',
        resourceIds: ['a', 'b'],
      },
    ]
    const occs = occurrences(events)
    const single = occs.find((o) => o.id === 1)!
    const moved = applyEventEdit(
      events,
      single,
      { ...single, resourceIds: ['c'] },
      {
        timeZone: BXL,
      },
    )
    expect(moved[0]).toMatchObject({ id: 1, resourceId: 'c' })
    expect(moved[0]).not.toHaveProperty('resourceIds')

    const second = occs.find((o) => o.id === 2 && o.start.day === 27)!
    const out = applyEventEdit(
      events,
      second,
      { ...second, resourceIds: ['c', 'b'] },
      { timeZone: BXL, createId: () => 'x' },
    )
    expect(out.find((e) => e.id === 'x')).toMatchObject({
      recurringEventId: 2,
      resourceIds: ['c', 'b'],
    })
    // Same resources: the event keeps its fields as they were.
    const same = applyEventEdit(
      events,
      single,
      { ...single, resourceIds: ['a'] },
      { timeZone: BXL },
    )
    expect(same[0]).toMatchObject({ resourceId: 'a' })
  })
})
