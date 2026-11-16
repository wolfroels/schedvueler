import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import { EventStore } from '../events'
import { saveEventEdit } from '../edit-events'
import { rangeToWindow, weekStrategy } from '../range'
import type { EventOccurrence, SchedulerEvent } from '../types'

const BXL = 'Europe/Brussels'
const d = (s: string) => Temporal.PlainDate.from(s)
const at = (s: string) => Temporal.PlainDateTime.from(s).toZonedDateTime(BXL)
let n = 0
const createId = () => `id${++n}`

function occurrences(events: SchedulerEvent[]): EventOccurrence<SchedulerEvent>[] {
  const store = new EventStore(events, { timeZone: BXL })
  return store.query(rangeToWindow(weekStrategy().range(d('2026-10-26')), BXL))
}

const series: SchedulerEvent = {
  id: 's',
  title: 'Stand-up',
  start: '2026-10-26T09:00',
  end: '2026-10-26T09:15',
  rrule: 'FREQ=DAILY;COUNT=5',
}
// Wednesday, the third occurrence of the series.
const wednesday = (events: SchedulerEvent[]) =>
  occurrences(events).find((o) => o.start.toPlainDate().equals(d('2026-10-28')))!
const same = (o: EventOccurrence<SchedulerEvent>) => ({
  start: o.start,
  end: o.end,
  allDay: o.allDay,
})

describe('saveEventEdit', () => {
  it('adds a new event with its fields and resource', () => {
    const next = saveEventEdit(
      [],
      null,
      {
        start: at('2026-10-27T10:00'),
        end: at('2026-10-27T11:30'),
        allDay: false,
        resourceIds: ['r1'],
        fields: { title: 'Pour', color: '#ea580c', location: 'Site B' },
      },
      { timeZone: BXL, createId },
    )
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      title: 'Pour',
      color: '#ea580c',
      location: 'Site B',
      resourceId: 'r1',
      allDay: false,
    })
    expect(String(next[0]!.start)).toContain('2026-10-27T10:00:00+01:00')
  })

  it('adds an all-day event that repeats', () => {
    const [event] = saveEventEdit(
      [],
      null,
      {
        start: at('2026-10-27T00:00'),
        end: at('2026-10-29T00:00'),
        allDay: true,
        fields: { title: 'Leave', rrule: 'FREQ=YEARLY' },
      },
      { timeZone: BXL, createId },
    )
    expect(event).toMatchObject({ start: '2026-10-27', end: '2026-10-29', allDay: true })
    expect(event!.rrule).toBe('FREQ=YEARLY')
  })

  it('renames a single event in place, keeping its id', () => {
    const plain: SchedulerEvent = {
      id: 1,
      title: 'Old',
      start: '2026-10-27T09:00',
      end: '2026-10-27T10:00',
    }
    const occ = occurrences([plain])[0]!
    const next = saveEventEdit(
      [plain],
      occ,
      { ...same(occ), fields: { title: 'New' } },
      { timeZone: BXL },
    )
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: 1, title: 'New' })
    // Same wall-clock times, written in full.
    expect(occurrences(next)[0]!.start.equals(occ.start)).toBe(true)
    expect(occurrences(next)[0]!.end.equals(occ.end)).toBe(true)
  })

  it('removes a field set to undefined', () => {
    const plain: SchedulerEvent = { id: 1, title: 'X', color: 'red', start: '2026-10-27T09:00' }
    const occ = occurrences([plain])[0]!
    const [event] = saveEventEdit(
      [plain],
      occ,
      { ...same(occ), fields: { color: undefined } },
      { timeZone: BXL },
    )
    expect(event).not.toHaveProperty('color')
  })

  it('renames one occurrence of a series as an exception, without a rule', () => {
    const occ = wednesday([series])
    const next = saveEventEdit(
      [series],
      occ,
      { ...same(occ), fields: { title: 'Planning', rrule: 'FREQ=WEEKLY' } },
      { timeZone: BXL, scope: 'this', createId },
    )
    expect(next[0]).toEqual(series)
    const exception = next[1]!
    expect(exception).toMatchObject({ title: 'Planning', recurringEventId: 's' })
    expect(exception).not.toHaveProperty('rrule')
    const titles = occurrences(next).map((o) => o.event.title)
    expect(titles).toEqual(['Stand-up', 'Stand-up', 'Planning', 'Stand-up', 'Stand-up'])
  })

  it('renames this and the following occurrences as a split-off series', () => {
    const occ = wednesday([series])
    const next = saveEventEdit(
      [series],
      occ,
      { ...same(occ), fields: { title: 'Planning' } },
      { timeZone: BXL, scope: 'following', createId },
    )
    const titles = occurrences(next).map((o) => o.event.title)
    expect(titles).toEqual(['Stand-up', 'Stand-up', 'Planning', 'Planning', 'Planning'])
  })

  it('changes the rule of the whole series', () => {
    const occ = wednesday([series])
    const next = saveEventEdit(
      [series],
      occ,
      { ...same(occ), fields: { title: 'Daily', rrule: 'FREQ=DAILY;COUNT=2' } },
      { timeZone: BXL, scope: 'all', createId },
    )
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: 's', title: 'Daily', rrule: 'FREQ=DAILY;COUNT=2' })
    expect(occurrences(next)).toHaveLength(2)
  })

  it('stops a series from repeating', () => {
    const withExdate = { ...series, exdates: ['2026-10-27T09:00'] }
    const occ = wednesday([withExdate])
    const [event] = saveEventEdit(
      [withExdate],
      occ,
      { ...same(occ), fields: { rrule: null } },
      { timeZone: BXL, scope: 'all', createId },
    )
    expect(event).not.toHaveProperty('rrule')
    expect(event).not.toHaveProperty('exdates')
  })

  it('edits an exception for the whole series through its series', () => {
    const exception: SchedulerEvent = {
      id: 'x',
      title: 'Moved',
      start: '2026-10-28T11:00',
      end: '2026-10-28T11:15',
      recurringEventId: 's',
      recurrenceId: '2026-10-28T09:00',
    }
    const occ = occurrences([series, exception]).find((o) => o.event.id === 'x')!
    const next = saveEventEdit(
      [series, exception],
      occ,
      { ...same(occ), fields: { title: 'Sync' } },
      { timeZone: BXL, scope: 'all', createId },
    )
    expect(next.find((e) => e.id === 's')!.title).toBe('Sync')
  })

  it('never copies ids or recurrence links from the form', () => {
    const plain: SchedulerEvent = { id: 1, start: '2026-10-27T09:00' }
    const occ = occurrences([plain])[0]!
    const [event] = saveEventEdit(
      [plain],
      occ,
      { ...same(occ), fields: { id: 99, recurringEventId: 's', title: 'T' } as never },
      { timeZone: BXL },
    )
    expect(event).toMatchObject({ id: 1, title: 'T' })
    expect(event).not.toHaveProperty('recurringEventId')
  })
})
