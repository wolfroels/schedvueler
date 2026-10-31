import { describe, expect, it, vi } from 'vitest'
import { Temporal } from '../temporal'
import { EventStore, groupByDay, partitionAllDay, segmentByDay, spanRow } from '../events'
import { dayStrategy, rangeDays, rangeToWindow, weekStrategy } from '../range'
import { createAccessors, type SchedulerEvent } from '../types'

const BXL = 'Europe/Brussels'
const d = (s: string) => Temporal.PlainDate.from(s)
const week = weekStrategy().range(d('2026-10-26'))
const weekWindow = rangeToWindow(week, BXL)

function keys(store: EventStore<SchedulerEvent>, window = weekWindow): string[] {
  return store.query(window).map((o) => o.key)
}

describe('EventStore', () => {
  it('returns events overlapping the window, sorted all-day first then by start', () => {
    const store = new EventStore<SchedulerEvent>(
      [
        { id: 'late', start: '2026-10-28T15:00', end: '2026-10-28T16:00' },
        { id: 'early', start: '2026-10-27T09:00', end: '2026-10-27T10:00' },
        { id: 'allday', start: '2026-10-28' },
        { id: 'before', start: '2026-10-20T09:00', end: '2026-10-20T10:00' },
        { id: 'after', start: '2026-11-02T00:00', end: '2026-11-02T01:00' },
        { id: 'spanning', start: '2026-10-25T22:00', end: '2026-10-26T02:00' },
      ],
      { timeZone: BXL },
    )
    expect(keys(store)).toEqual(['allday', 'spanning', 'early', 'late'])
  })

  it('applies default durations and reads all-day end dates as exclusive', () => {
    const store = new EventStore<SchedulerEvent>(
      [
        { id: 'noend', start: '2026-10-27T09:00' },
        { id: 'multi', start: '2026-10-27', end: '2026-10-29' },
      ],
      { timeZone: BXL },
    )
    const [multi, noend] = store.query(weekWindow)
    expect(noend!.end.toString()).toBe('2026-10-27T10:00:00+01:00[Europe/Brussels]')
    expect(multi!.allDay).toBe(true)
    expect(multi!.end.toPlainDate().toString()).toBe('2026-10-29')
  })

  it('shows floating times in the event zone, converted to the display zone', () => {
    const store = new EventStore<SchedulerEvent>(
      [{ id: 'ny', start: '2026-10-27T09:00', timezone: 'America/New_York' }],
      { timeZone: BXL },
    )
    expect(store.query(weekWindow)[0]!.start.hour).toBe(14)
  })

  it('expands recurring events, honours exdates and replaces edited occurrences', () => {
    const store = new EventStore<SchedulerEvent>(
      [
        {
          id: 'standup',
          start: '2026-01-05T09:00',
          end: '2026-01-05T09:15',
          rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
          exdates: ['2026-10-27T09:00'],
        },
        {
          id: 'standup-moved',
          start: '2026-10-29T11:00',
          end: '2026-10-29T11:15',
          recurringEventId: 'standup',
          recurrenceId: '2026-10-29T09:00',
        },
      ],
      { timeZone: BXL },
    )
    const occ = store.query(weekWindow)
    expect(occ.map((o) => o.start.toPlainDateTime().toString({ smallestUnit: 'minute' }))).toEqual([
      '2026-10-26T09:00',
      '2026-10-28T09:00',
      '2026-10-29T11:00',
      '2026-10-30T09:00',
    ])
    const moved = occ.find((o) => o.id === 'standup-moved')!
    expect(moved.isException).toBe(true)
    expect(moved.seriesId).toBe('standup')
    expect(occ[0]!.recurring).toBe(true)
    expect(occ[0]!.key).toBe('standup::2026-10-26T09:00:00+01:00[Europe/Brussels]')
  })

  it('keeps occurrence objects stable between queries', () => {
    const store = new EventStore<SchedulerEvent>(
      [
        { id: 'a', start: '2026-10-27T09:00' },
        { id: 'r', start: '2026-10-01T09:00', rrule: 'FREQ=DAILY' },
      ],
      { timeZone: BXL },
    )
    const first = store.query(weekWindow)
    const second = store.query(weekWindow)
    expect(second).toEqual(first)
    second.forEach((occ, i) => expect(occ).toBe(first[i]))
  })

  it('upsert and remove change only what was touched', () => {
    const store = new EventStore<SchedulerEvent>([{ id: 1, start: '2026-10-27T09:00' }], {
      timeZone: BXL,
    })
    const v = store.version
    store.upsert({ id: 2, start: '2026-10-28T09:00' })
    store.upsert({ id: 1, start: '2026-10-30T09:00' })
    expect(store.version).toBeGreaterThan(v)
    expect(keys(store)).toEqual(['2', '1'])
    store.remove(2)
    expect(keys(store)).toEqual(['1'])
    expect(store.size).toBe(1)
  })

  it('filters by resource', () => {
    const store = new EventStore<SchedulerEvent>(
      [
        { id: 'a', start: '2026-10-27T09:00', resourceId: 'room1' },
        { id: 'b', start: '2026-10-27T09:00', resourceIds: ['room2', 'room3'] },
        { id: 'c', start: '2026-10-27T09:00' },
      ],
      { timeZone: BXL },
    )
    expect(store.query(weekWindow, { resourceIds: ['room3'] }).map((o) => o.key)).toEqual(['b'])
  })

  it('supports custom event shapes through accessors', () => {
    interface Booking {
      bookingId: number
      from: Date
      to: Date
      room: string
    }
    const store = new EventStore<Booking>(
      [
        {
          bookingId: 7,
          from: new Date('2026-10-27T08:00Z'),
          to: new Date('2026-10-27T09:00Z'),
          room: 'A',
        },
      ],
      {
        timeZone: BXL,
        accessors: createAccessors<Booking>({
          id: (b) => b.bookingId,
          start: (b) => b.from,
          end: (b) => b.to,
          resourceIds: (b) => [b.room],
        }),
      },
    )
    const [occ] = store.query(weekWindow)
    expect(occ!.id).toBe(7)
    expect(occ!.event.room).toBe('A')
    expect(occ!.start.hour).toBe(9)
  })

  it('skips invalid events and reports them', () => {
    const onInvalidEvent = vi.fn()
    const store = new EventStore<SchedulerEvent>(
      [
        { id: 'bad-date', start: 'nope' },
        { id: 'bad-rule', start: '2026-10-27T09:00', rrule: 'FREQ=NEVER' },
        { id: 'ok', start: '2026-10-27T09:00' },
      ],
      { timeZone: BXL, onInvalidEvent },
    )
    expect(onInvalidEvent).toHaveBeenCalledTimes(2)
    expect(keys(store)).toEqual(['ok'])
  })

  it('re-reads events when the display zone changes', () => {
    const store = new EventStore<SchedulerEvent>([{ id: 'x', start: '2026-10-27T09:00Z' }], {
      timeZone: BXL,
    })
    store.configure({ timeZone: 'Asia/Tokyo' })
    const window = rangeToWindow(weekStrategy().range(d('2026-10-26')), 'Asia/Tokyo')
    expect(store.query(window)[0]!.start.hour).toBe(18)
  })

  it('queries 10 000 events quickly', () => {
    const events: SchedulerEvent[] = []
    const base = Temporal.ZonedDateTime.from('2026-01-01T00:00[Europe/Brussels]')
    for (let i = 0; i < 10_000; i++) {
      const start = base.add({ minutes: i * 53 })
      events.push({ id: i, start: start.toString(), end: start.add({ minutes: 45 }).toString() })
    }
    const store = new EventStore(events, { timeZone: BXL })
    store.query(weekWindow)
    const t = performance.now()
    for (let i = 0; i < 100; i++) store.query(weekWindow)
    expect((performance.now() - t) / 100).toBeLessThan(5)
  })
})

describe('segments', () => {
  const store = new EventStore<SchedulerEvent>(
    [
      { id: 'overnight', start: '2026-10-27T22:00', end: '2026-10-28T02:00' },
      // Runs into the hidden Saturday, so it does not end within a weekdays-only row.
      { id: 'allday', start: '2026-10-28', end: '2026-11-01' },
      { id: 'tomidnight', start: '2026-10-29T20:00', end: '2026-10-30T00:00' },
      { id: 'weekend', start: '2026-10-31T10:00', end: '2026-10-31T11:00' },
    ],
    { timeZone: BXL },
  )
  const days = rangeDays(week)

  it('splits overnight events across day columns', () => {
    const { timed } = partitionAllDay(store.query(weekWindow))
    const segments = segmentByDay(timed, days, BXL)
    const overnight = segments.flat().filter((s) => s.occurrence.id === 'overnight')
    expect(
      overnight.map((s) => [s.date.toString(), s.startMinute, s.endMinute, s.isStart, s.isEnd]),
    ).toEqual([
      ['2026-10-27', 1320, 1440, true, false],
      ['2026-10-28', 0, 120, false, true],
    ])
    const midnight = segments.flat().filter((s) => s.occurrence.id === 'tomidnight')
    expect(midnight.map((s) => [s.date.toString(), s.endMinute])).toEqual([['2026-10-29', 1440]])
  })

  it('uses wall-clock minutes on the 25-hour fall-back day', () => {
    const fall = new EventStore<SchedulerEvent>(
      [{ id: 'x', start: '2026-10-25T03:00', end: '2026-10-25T04:00' }],
      {
        timeZone: BXL,
      },
    )
    const [seg] = segmentByDay(
      fall.query(rangeToWindow({ start: d('2026-10-25'), end: d('2026-10-26') }, BXL)),
      [d('2026-10-25')],
      BXL,
    )[0]!
    expect([seg!.startMinute, seg!.endMinute]).toEqual([180, 240])
  })

  it('spans all-day events over row columns and skips hidden days', () => {
    const weekdays = rangeDays(week, [6, 7])
    const spans = spanRow(store.query(weekWindow), weekdays, BXL)
    const byId = Object.fromEntries(
      spans.map((s) => [s.occurrence.id, [s.startCol, s.endCol, s.isStart, s.isEnd]]),
    )
    expect(byId.allday).toEqual([2, 5, true, false])
    expect(byId.overnight).toEqual([1, 3, true, true])
    expect(byId.weekend).toBeUndefined()
  })
})

describe('setEvents reuse', () => {
  it('keeps records for unchanged event objects and re-reads changed ones', () => {
    const a: SchedulerEvent = { id: 'a', start: '2026-10-27T09:00' }
    const b: SchedulerEvent = { id: 'b', start: '2026-10-28T09:00' }
    const store = new EventStore<SchedulerEvent>([a, b], { timeZone: BXL })
    const [occA] = store.query(weekWindow)
    const b2 = { ...b, start: '2026-10-29T09:00' }
    store.setEvents([a, b2])
    const occ = store.query(weekWindow)
    expect(occ[0]).toBe(occA)
    expect(occ[1]!.start.day).toBe(29)
  })

  it('re-reads everything when options change, even for the same objects', () => {
    const a: SchedulerEvent = { id: 'a', start: '2026-10-27T09:00Z' }
    const store = new EventStore<SchedulerEvent>([a], { timeZone: BXL })
    store.configure({ timeZone: 'UTC' })
    store.setEvents([a])
    const window = rangeToWindow(weekStrategy().range(d('2026-10-26')), 'UTC')
    expect(store.query(window)[0]!.start.hour).toBe(9)
  })
})

describe('groupByDay', () => {
  it('groups occurrences per day and skips empty days', () => {
    const store = new EventStore<SchedulerEvent>(
      [
        { id: 'trip', start: '2026-10-27', end: '2026-10-29' },
        { id: 'call', start: '2026-10-27T15:00' },
        { id: 'late', start: '2026-10-30T23:00', end: '2026-10-31T01:00' },
      ],
      { timeZone: BXL },
    )
    const groups = groupByDay(store.query(weekWindow), rangeDays(week), BXL)
    expect(groups.map((g) => [g.date.toString(), g.segments.map((s) => s.occurrence.id)])).toEqual([
      ['2026-10-27', ['trip', 'call']],
      ['2026-10-28', ['trip']],
      ['2026-10-30', ['late']],
      ['2026-10-31', ['late']],
    ])
    expect(groupByDay(store.query(weekWindow), rangeDays(week), BXL, true)).toHaveLength(7)
  })
})

describe('hasException', () => {
  it('tells whether an exception replaces an occurrence', () => {
    const BXL = 'Europe/Brussels'
    const store = new EventStore<SchedulerEvent>(
      [
        { id: 's', start: '2026-10-26T09:00', end: '2026-10-26T10:00', rrule: 'FREQ=DAILY' },
        {
          id: 'e',
          start: '2026-10-27T11:00',
          end: '2026-10-27T12:00',
          recurringEventId: 's',
          recurrenceId: '2026-10-27T09:00',
        },
      ],
      { timeZone: BXL },
    )
    const at = (time: string) => Temporal.ZonedDateTime.from(`${time}[${BXL}]`)
    expect(store.hasException('s', at('2026-10-27T09:00'))).toBe(true)
    expect(store.hasException('s', at('2026-10-28T09:00'))).toBe(false)
  })
})

describe('event data edge cases', () => {
  const zone = 'Europe/Brussels'

  it('includes the last day of an all-day event with a date-time end', () => {
    const store = new EventStore<SchedulerEvent>(
      [{ id: 1, start: '2026-05-04T09:00', end: '2026-05-06T17:00', allDay: true }],
      { timeZone: zone },
    )
    const window = rangeToWindow({ start: d('2026-05-01'), end: d('2026-05-10') }, zone)
    expect(store.query(window)[0]!.end.toPlainDate().toString()).toBe('2026-05-07')
  })

  it('reports ids that collide', () => {
    const onInvalidEvent = vi.fn()
    new EventStore<SchedulerEvent>(
      [
        { id: 1, start: '2026-05-04' },
        { id: '1', start: '2026-05-05' },
      ],
      { timeZone: zone, onInvalidEvent },
    )
    expect(onInvalidEvent).toHaveBeenCalledOnce()
  })
})

describe('dayStrategy with hidden days', () => {
  const strategy = dayStrategy({ hiddenDays: [6, 7] })

  it('moves a hidden anchor to the next visible day', () => {
    expect(strategy.range(d('2026-10-31')).start.toString()).toBe('2026-11-02')
  })

  it('steps over hidden days both ways', () => {
    expect(strategy.step(d('2026-10-30'), 1).toString()).toBe('2026-11-02')
    expect(strategy.step(d('2026-11-02'), -1).toString()).toBe('2026-10-30')
  })

  it('shows the requested number of visible days', () => {
    const range = dayStrategy({ days: 3, hiddenDays: [6, 7] }).range(d('2026-10-30'))
    expect(rangeDays(range, [6, 7]).map(String)).toEqual(['2026-10-30', '2026-11-02', '2026-11-03'])
  })
})
