import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import { EventStore } from '../events'
import {
  computeDrop,
  computeMove,
  computeResize,
  computeSelection,
  type EventTimes,
  type Hit,
} from '../interaction'
import {
  applyEventEdit,
  applyEventEdits,
  duplicateEvent,
  pasteEvents,
  removeEventOccurrence,
  removeEventOccurrences,
  withCustomEvents,
} from '../edit-events'
import { rangeToWindow, weekStrategy } from '../range'
import type { EventOccurrence, SchedulerEvent } from '../types'

const BXL = 'Europe/Brussels'
const d = (s: string) => Temporal.PlainDate.from(s)
const opts = { timeZone: BXL, snapMinutes: 15, defaultDurationMinutes: 60 }
const time = (date: string, minute: number): Hit => ({ zone: 'time', date: d(date), minute })
const day = (date: string, zone: 'all-day' | 'month' = 'all-day'): Hit => ({ zone, date: d(date) })

function occurrences(
  events: SchedulerEvent[],
  week = '2026-10-26',
): EventOccurrence<SchedulerEvent>[] {
  const store = new EventStore(events, { timeZone: BXL })
  return store.query(rangeToWindow(weekStrategy().range(d(week)), BXL))
}

function one(event: SchedulerEvent): EventOccurrence<SchedulerEvent> {
  return occurrences([event])[0]!
}

const fmt = (t: EventTimes | null) =>
  t &&
  (t.allDay
    ? `${t.start.toPlainDate()}..${t.end.toPlainDate()} all-day`
    : `${t.start.toPlainDateTime().toString({ smallestUnit: 'minute' })}..${t.end
        .toPlainDateTime()
        .toString({ smallestUnit: 'minute' })}`)

describe('computeMove', () => {
  const ev = one({ id: 1, start: '2026-10-27T09:10', end: '2026-10-27T10:10' })

  it('moves to an earlier day at a later time, and to a later day at an earlier time', () => {
    // Mixed directions used to throw (a Temporal duration cannot mix signs), freezing the preview.
    expect(fmt(computeMove(ev, time('2026-10-27', 570), time('2026-10-26', 690), opts))).toBe(
      '2026-10-26T11:10..2026-10-26T12:10',
    )
    expect(fmt(computeMove(ev, time('2026-10-27', 570), time('2026-10-28', 450), opts))).toBe(
      '2026-10-28T07:10..2026-10-28T08:10',
    )
    expect(
      fmt(computeResize(ev, 'end', time('2026-10-27', 610), time('2026-10-26', 1430), opts)),
    ).toBe('2026-10-27T09:10..2026-10-27T09:25')
  })

  it('moves by the snapped distance and keeps odd minutes', () => {
    // Grabbed at 09:30, dropped at 11:07 -> +97 min snaps to +90.
    expect(fmt(computeMove(ev, time('2026-10-27', 570), time('2026-10-29', 667), opts))).toBe(
      '2026-10-29T10:40..2026-10-29T11:40',
    )
  })

  it('keeps the real duration when moved off the DST night', () => {
    // 23:00 -> 05:00 over the night the clocks go back is 7 real hours.
    const late = occurrences(
      [{ id: 2, start: '2026-10-24T23:00', end: '2026-10-25T05:00' }],
      '2026-10-19',
    )[0]!
    expect(late.endMs - late.startMs).toBe(7 * 3600_000)
    const out = computeMove(late, time('2026-10-24', 1380), time('2026-10-25', 1380), opts)!
    expect(fmt(out)).toBe('2026-10-25T23:00..2026-10-26T06:00')
  })

  it('turns timed events into all-day events and back', () => {
    expect(fmt(computeMove(ev, time('2026-10-27', 570), day('2026-10-28'), opts))).toBe(
      '2026-10-28..2026-10-29 all-day',
    )
    const allDay = one({ id: 3, start: '2026-10-27', end: '2026-10-29' })
    expect(fmt(computeMove(allDay, day('2026-10-27'), time('2026-10-28', 607), opts))).toBe(
      '2026-10-28T10:00..2026-10-28T11:00',
    )
  })

  it('moves multi-day all-day events by whole days', () => {
    const allDay = one({ id: 3, start: '2026-10-27', end: '2026-10-29' })
    expect(fmt(computeMove(allDay, day('2026-10-28'), day('2026-10-30'), opts))).toBe(
      '2026-10-29..2026-10-31 all-day',
    )
  })

  it('keeps the time of day when moving timed events in a month grid', () => {
    expect(fmt(computeMove(ev, day('2026-10-27', 'month'), day('2026-11-03', 'month'), opts))).toBe(
      '2026-11-03T09:10..2026-11-03T10:10',
    )
  })
})

describe('computeResize', () => {
  const ev = one({ id: 1, start: '2026-10-27T09:00', end: '2026-10-27T10:00' })

  it('resizes the end in snapped steps, never below one step', () => {
    expect(
      fmt(computeResize(ev, 'end', time('2026-10-27', 600), time('2026-10-27', 652), opts)),
    ).toBe('2026-10-27T09:00..2026-10-27T10:45')
    expect(
      fmt(computeResize(ev, 'end', time('2026-10-27', 600), time('2026-10-27', 400), opts)),
    ).toBe('2026-10-27T09:00..2026-10-27T09:15')
  })

  it('resizes the start', () => {
    expect(
      fmt(computeResize(ev, 'start', time('2026-10-27', 540), time('2026-10-27', 480), opts)),
    ).toBe('2026-10-27T08:00..2026-10-27T10:00')
  })

  it('resizes all-day events in days and refuses the time grid', () => {
    const allDay = one({ id: 2, start: '2026-10-27', end: '2026-10-29' })
    expect(fmt(computeResize(allDay, 'end', day('2026-10-28'), day('2026-10-30'), opts))).toBe(
      '2026-10-27..2026-10-31 all-day',
    )
    expect(fmt(computeResize(allDay, 'start', day('2026-10-27'), day('2026-10-30'), opts))).toBe(
      '2026-10-28..2026-10-29 all-day',
    )
    expect(
      computeResize(allDay, 'end', day('2026-10-28'), time('2026-10-28', 600), opts),
    ).toBeNull()
  })
})

describe('computeSelection', () => {
  it('selects time ranges in either direction', () => {
    expect(fmt(computeSelection(time('2026-10-27', 610), time('2026-10-27', 545), opts))).toBe(
      '2026-10-27T09:00..2026-10-27T10:15',
    )
  })

  it('selects day ranges and rejects mixed zones', () => {
    expect(
      fmt(computeSelection(day('2026-10-30', 'month'), day('2026-10-27', 'month'), opts)),
    ).toBe('2026-10-27..2026-10-31 all-day')
    expect(computeSelection(day('2026-10-27'), time('2026-10-27', 600), opts)).toBeNull()
  })

  it('snaps from the snap origin, for steps that do not divide the day start', () => {
    // Half days of 420 minutes from 06:00: 06:00-13:00 and 13:00-20:00.
    const halfDays = { ...opts, snapMinutes: 420, snapOrigin: 360 }
    const at = (minute: number): Hit => ({ zone: 'timeline', date: d('2026-10-27'), minute })
    expect(fmt(computeSelection(at(400), at(400), halfDays))).toBe(
      '2026-10-27T06:00..2026-10-27T13:00',
    )
    expect(fmt(computeSelection(at(800), at(800), halfDays))).toBe(
      '2026-10-27T13:00..2026-10-27T20:00',
    )
    // Without an origin the steps count from midnight, as before.
    expect(fmt(computeSelection(at(800), at(800), { ...halfDays, snapOrigin: undefined }))).toBe(
      '2026-10-27T07:00..2026-10-27T14:00',
    )
  })
})

describe('applyEventEdit', () => {
  const series: SchedulerEvent = {
    id: 'standup',
    title: 'Stand-up',
    start: '2026-10-05T09:00',
    end: '2026-10-05T09:15',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
  }
  const at = (date: string, hour: number, minute = 0): EventTimes => {
    const start = Temporal.PlainDateTime.from(`${date}T00:00`)
      .with({ hour, minute })
      .toZonedDateTime(BXL)
    return { start, end: start.add({ minutes: 15 }), allDay: false }
  }
  const ids = (() => {
    let n = 0
    return () => `new-${++n}`
  })()

  function weekKeys(events: SchedulerEvent[], week = '2026-10-26') {
    return occurrences(events, week).map(
      (o) =>
        `${o.start.toPlainDateTime().toString({ smallestUnit: 'minute' })}${o.isException ? '*' : ''}`,
    )
  }

  it('updates plain events in place and keeps other objects', () => {
    const other: SchedulerEvent = { id: 'x', start: '2026-10-28T12:00' }
    const plain: SchedulerEvent = { id: 'p', start: '2026-10-27T09:00', end: '2026-10-27T10:00' }
    const occ = occurrences([plain])[0]!
    const out = applyEventEdit([plain, other], occ, at('2026-10-29', 14), { timeZone: BXL })
    expect(out[1]).toBe(other)
    // Still a wall-clock time, like the value it replaces.
    expect(out[0]!.start).toBe('2026-10-29T14:00:00')
    const exact = { ...plain, start: '2026-10-27T09:00+01:00', end: '2026-10-27T10:00+01:00' }
    const pinned = applyEventEdit([exact], occurrences([exact])[0]!, at('2026-10-29', 14), {
      timeZone: BXL,
    })
    expect(pinned[0]!.start).toBe('2026-10-29T14:00:00+01:00[Europe/Brussels]')
  })

  it('"this" adds an exception for one occurrence', () => {
    const wed = occurrences([series])[1]!
    const out = applyEventEdit([series], wed, at('2026-10-28', 11), {
      timeZone: BXL,
      scope: 'this',
      createId: ids,
    })
    expect(weekKeys(out)).toEqual(['2026-10-26T09:00', '2026-10-28T11:00*'])
    expect(weekKeys(out, '2026-11-02')).toEqual(['2026-11-02T09:00', '2026-11-04T09:00'])
  })

  describe('a series without its own zone', () => {
    const tokyo = (events: SchedulerEvent[]) =>
      new EventStore(events, { timeZone: 'Asia/Tokyo' })
        .query(rangeToWindow(weekStrategy().range(d('2026-10-26')), 'Asia/Tokyo'))
        .map((o) => o.start.toPlainDateTime().toString({ smallestUnit: 'minute' }))

    it('keeps an exception matched to its occurrence in another display zone', () => {
      const wed = occurrences([series])[1]!
      const out = applyEventEdit([series], wed, at('2026-10-28', 11), {
        timeZone: BXL,
        createId: ids,
      })
      expect(tokyo(out)).toEqual(['2026-10-26T09:00', '2026-10-28T11:00'])
    })

    it('keeps a deleted occurrence deleted in another display zone', () => {
      const wed = occurrences([series])[1]!
      const out = removeEventOccurrence([series], wed, { timeZone: BXL })
      expect(tokyo(out)).toEqual(['2026-10-26T09:00'])
    })
  })

  describe('an already edited occurrence', () => {
    const edited = () => {
      const wed = occurrences([series])[1]!
      const events = applyEventEdit([series], wed, at('2026-10-28', 11), {
        timeZone: BXL,
        createId: ids,
      })
      return { events, exception: occurrences(events).find((o) => o.isException)! }
    }

    it('"this" only changes the exception', () => {
      const { events, exception } = edited()
      const out = applyEventEdit(events, exception, at('2026-10-28', 12), {
        timeZone: BXL,
        scope: 'this',
      })
      expect(out[0]).toBe(series)
      expect(weekKeys(out)).toEqual(['2026-10-26T09:00', '2026-10-28T12:00*'])
    })

    it('"all" moves the series and drops the exception', () => {
      const { events, exception } = edited()
      const out = applyEventEdit(events, exception, at('2026-10-28', 12), {
        timeZone: BXL,
        scope: 'all',
      })
      expect(out).toHaveLength(1)
      expect(weekKeys(out)).toEqual(['2026-10-26T12:00', '2026-10-28T12:00'])
    })

    it('"following" splits the series at the original occurrence', () => {
      const { events, exception } = edited()
      const out = applyEventEdit(events, exception, at('2026-10-28', 12), {
        timeZone: BXL,
        scope: 'following',
        createId: ids,
      })
      expect(weekKeys(out)).toEqual(['2026-10-26T09:00', '2026-10-28T12:00'])
      expect(weekKeys(out, '2026-11-02')).toEqual(['2026-11-02T12:00', '2026-11-04T12:00'])
    })
  })

  it('"following" splits the series and moves the rest', () => {
    const wed = occurrences([series])[1]!
    const out = applyEventEdit([series], wed, at('2026-10-29', 10), {
      timeZone: BXL,
      scope: 'following',
      createId: ids,
    })
    expect(out).toHaveLength(2)
    // Wednesday moved to Thursday, so the new series repeats on Tuesday and Thursday.
    expect(weekKeys(out)).toEqual(['2026-10-26T09:00', '2026-10-29T10:00'])
    expect(weekKeys(out, '2026-11-02')).toEqual(['2026-11-03T10:00', '2026-11-05T10:00'])
    expect(weekKeys(out, '2026-10-19')).toEqual(['2026-10-19T09:00', '2026-10-21T09:00'])
  })

  it('"following" carries later exdates over, shifted with the series', () => {
    const withEx = { ...series, exdates: ['2026-10-12T09:00', '2026-11-04T09:00'] }
    const wed = occurrences([withEx])[1]!
    const out = applyEventEdit([withEx], wed, at('2026-10-29', 10), {
      timeZone: BXL,
      scope: 'following',
      createId: ids,
    })
    // 4 Nov (Wed) was excluded; in the new series that occurrence is Thu 5 Nov at 10:00.
    expect(weekKeys(out, '2026-11-02')).toEqual(['2026-11-03T10:00'])
    expect(out[1]!.exdates).toEqual(['2026-11-05T10:00'])
    // The earlier exdate stays with the original series.
    expect(weekKeys(out, '2026-10-12')).toEqual(['2026-10-14T09:00'])
  })

  it('"all" moves the series and drops its exceptions', () => {
    const exception: SchedulerEvent = {
      id: 'ex',
      start: '2026-10-28T11:00',
      recurringEventId: 'standup',
      recurrenceId: '2026-10-28T09:00',
    }
    const mon = occurrences([series, exception])[0]!
    const out = applyEventEdit([series, exception], mon, at('2026-10-26', 8, 30), {
      timeZone: BXL,
      scope: 'all',
    })
    expect(out.map((e) => e.id)).toEqual(['standup'])
    expect(weekKeys(out, '2026-10-05')).toEqual(['2026-10-05T08:30', '2026-10-07T08:30'])
  })
})

describe('removeEventOccurrence', () => {
  const series: SchedulerEvent = {
    id: 's',
    start: '2026-10-26',
    rrule: 'FREQ=DAILY',
  }

  it('"this" adds an exdate, "following" ends the series, "all" removes it', () => {
    const occ = occurrences([series])
    const thisOnly = removeEventOccurrence([series], occ[2]!, { timeZone: BXL, scope: 'this' })
    expect(occurrences(thisOnly).map((o) => o.start.day)).toEqual([26, 27, 29, 30, 31, 1])
    const following = removeEventOccurrence([series], occ[2]!, {
      timeZone: BXL,
      scope: 'following',
    })
    expect(occurrences(following).map((o) => o.start.day)).toEqual([26, 27])
    expect(removeEventOccurrence([series], occ[2]!, { timeZone: BXL, scope: 'all' })).toEqual([])
  })

  it('removing an edited occurrence keeps the generated one away', () => {
    const exception: SchedulerEvent = {
      id: 'ex',
      start: '2026-10-28T10:00',
      recurringEventId: 's',
      recurrenceId: '2026-10-28',
    }
    const occ = occurrences([series, exception]).find((o) => o.id === 'ex')!
    const out = removeEventOccurrence([series, exception], occ, { timeZone: BXL })
    expect(occurrences(out).map((o) => o.start.day)).toEqual([26, 27, 29, 30, 31, 1])
  })
})

describe('computeDrop', () => {
  const tl = (date: string, minute: number, resourceId?: string): Hit => ({
    zone: 'timeline',
    date: d(date),
    minute,
    resourceId,
  })

  it('starts timed drops at the snapped time in the time grid', () => {
    const out = computeDrop(time('2026-10-27', 607), { durationMinutes: 90 }, opts)
    expect(fmt(out)).toBe('2026-10-27T10:00..2026-10-27T11:30')
    expect(out.resourceIds).toEqual([])
    // All-day templates still become timed in the grid, with the default length.
    expect(fmt(computeDrop(time('2026-10-27', 600), { allDay: true }, opts))).toBe(
      '2026-10-27T10:00..2026-10-27T11:00',
    )
  })

  it('makes day drops all-day unless the template is timed', () => {
    expect(fmt(computeDrop(day('2026-10-27', 'month'), { days: 3 }, opts))).toBe(
      '2026-10-27..2026-10-30 all-day',
    )
    expect(
      fmt(
        computeDrop(
          day('2026-10-27'),
          { allDay: false, startMinute: 780, durationMinutes: 30 },
          opts,
        ),
      ),
    ).toBe('2026-10-27T13:00..2026-10-27T13:30')
  })

  it('uses the time on sub-day timelines and the day on day-slot timelines, with the resource', () => {
    const hourly = computeDrop(tl('2026-10-27', 610, 'crane'), {}, opts)
    expect(fmt(hourly)).toBe('2026-10-27T10:00..2026-10-27T11:00')
    expect(hourly.resourceIds).toEqual(['crane'])
    const daily = { ...opts, snapMinutes: 1440 }
    expect(fmt(computeDrop(tl('2026-10-27', 610), {}, daily))).toBe(
      '2026-10-27..2026-10-28 all-day',
    )
    expect(fmt(computeDrop(tl('2026-10-27', 610), { allDay: false }, daily))).toBe(
      '2026-10-27T09:00..2026-10-27T10:00',
    )
  })
})

describe('editing several events', () => {
  const a = one({ id: 'a', title: 'A', start: '2026-10-26T09:00', end: '2026-10-26T10:00' })
  const b = one({ id: 'b', title: 'B', start: '2026-10-27T09:00', end: '2026-10-27T10:00' })
  const events = [a.event, b.event]
  const later = (o: typeof a) => ({
    occurrence: o,
    start: o.start.add({ hours: 1 }),
    end: o.end.add({ hours: 1 }),
    allDay: false,
  })

  it('applies and removes several at once', () => {
    const moved = applyEventEdits(events, [later(a), later(b)], { timeZone: BXL })
    expect(moved.map((e) => String(e.start).slice(0, 16))).toEqual([
      '2026-10-26T10:00',
      '2026-10-27T10:00',
    ])
    expect(removeEventOccurrences(events, [a, b], { timeZone: BXL })).toEqual([])
  })

  it('duplicates without series fields, and pastes', () => {
    const series = occurrences([
      { id: 's', start: '2026-10-26T09:00', end: '2026-10-26T10:00', rrule: 'FREQ=DAILY;COUNT=2' },
    ])[0]!
    const out = duplicateEvent([series.event], series, later(series), {
      timeZone: BXL,
      createId: () => 'copy',
    })
    expect(out).toHaveLength(2)
    expect(out[1]).toMatchObject({ id: 'copy' })
    expect(out[1]!.rrule).toBeUndefined()
    expect(pasteEvents(events, [later(a)], { timeZone: BXL })).toHaveLength(3)
    expect(pasteEvents(events, [later(a)], { timeZone: BXL, cut: true })).toHaveLength(2)
  })

  it('works on events of any shape, keeping unchanged ones', () => {
    interface Task {
      key: string
      from: string
      to: string
    }
    const tasks: Task[] = [
      { key: 'a', from: '2026-10-26T09:00', to: '2026-10-26T10:00' },
      { key: 'b', from: '2026-10-27T09:00', to: '2026-10-27T10:00' },
    ]
    const out = withCustomEvents<Task>(
      tasks,
      {
        read: (t) => ({ id: t.key, start: t.from, end: t.to }),
        write: (e, original) => ({
          ...original!,
          from: String(e.start),
          to: String(e.end),
        }),
      },
      (list) => applyEventEdit(list, { ...a, event: list[0]! }, later(a), { timeZone: BXL }),
    )
    expect(out[1]).toBe(tasks[1])
    expect(out[0]!.from.slice(0, 16)).toBe('2026-10-26T10:00')
  })
})
