import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import {
  closedIntervals,
  findBlocked,
  findOverlaps,
  fitsBusinessHours,
  openIntervals,
} from '../availability'
import {
  emptyStretches,
  findConflicts,
  findFreeSlots,
  nextFreeSlot,
  overlapHours,
  recurrenceScopeOptions,
} from '../planning'
import type { EventOccurrence } from '../types'

const d = (s: string) => Temporal.PlainDate.from(s)
const z = (s: string) => Temporal.ZonedDateTime.from(`${s}[UTC]`)
const MONDAY = d('2026-06-15')
const SATURDAY = d('2026-06-20')
const OFFICE = { start: '09:00', end: '17:00' }

describe('business hours', () => {
  it('defaults to Monday to Friday', () => {
    expect(openIntervals(MONDAY, OFFICE)).toEqual([{ start: 540, end: 1020 }])
    expect(openIntervals(SATURDAY, OFFICE)).toEqual([])
  })

  it('merges overlapping rules and sorts them', () => {
    const hours = [
      { start: '13:00', end: '17:00' },
      { start: '09:00', end: '12:00' },
      { start: '11:00', end: '13:00' },
    ]
    expect(openIntervals(MONDAY, hours)).toEqual([{ start: 540, end: 1020 }])
  })

  it('closes what is left of the visible hours', () => {
    expect(closedIntervals(MONDAY, OFFICE)).toEqual([
      { start: 0, end: 540 },
      { start: 1020, end: 1440 },
    ])
    expect(closedIntervals(MONDAY, OFFICE, 600, 900)).toEqual([])
    expect(closedIntervals(SATURDAY, OFFICE, 480, 1080)).toEqual([{ start: 480, end: 1080 }])
  })

  it('keeps a lunch break closed', () => {
    const hours = [
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ]
    expect(closedIntervals(MONDAY, hours, 540, 1020)).toEqual([{ start: 720, end: 780 }])
  })

  it('checks whether a range fits', () => {
    expect(fitsBusinessHours(z('2026-06-15T09:00'), z('2026-06-15T17:00'), OFFICE)).toBe(true)
    expect(fitsBusinessHours(z('2026-06-15T08:30'), z('2026-06-15T10:00'), OFFICE)).toBe(false)
    expect(fitsBusinessHours(z('2026-06-15T16:00'), z('2026-06-15T17:30'), OFFICE)).toBe(false)
    expect(fitsBusinessHours(z('2026-06-20T10:00'), z('2026-06-20T11:00'), OFFICE)).toBe(false)
    expect(fitsBusinessHours(z('2026-06-15T16:00'), z('2026-06-16T10:00'), OFFICE)).toBe(false)
  })
})

describe('conflicts', () => {
  const blocked = [
    { startMs: 100, endMs: 200, resourceIds: ['a'], source: { start: 0, end: 0 } },
    { startMs: 300, endMs: 400, resourceIds: undefined, source: { start: 0, end: 0 } },
  ]

  it('finds blocked times by range and resource', () => {
    expect(findBlocked(blocked, 150, 160, ['a'])).toBe(blocked[0])
    expect(findBlocked(blocked, 150, 160, ['b'])).toBeUndefined()
    expect(findBlocked(blocked, 150, 160)).toBe(blocked[0])
    expect(findBlocked(blocked, 350, 360, ['b'])).toBe(blocked[1])
    expect(findBlocked(blocked, 200, 300, ['a'])).toBeUndefined()
  })

  const occ = (key: string, startMs: number, endMs: number, resourceIds: string[] = []) =>
    ({ key, startMs, endMs, resourceIds }) as unknown as EventOccurrence<unknown>

  it('finds overlaps on shared resources, leaving out the event itself', () => {
    const list = [occ('x', 0, 100, ['a']), occ('y', 50, 150, ['b']), occ('z', 100, 200)]
    expect(findOverlaps(list, 50, 80, ['a']).map((o) => o.key)).toEqual(['x'])
    expect(findOverlaps(list, 50, 80, ['a'], 'x')).toEqual([])
    expect(findOverlaps(list, 120, 130, ['a']).map((o) => o.key)).toEqual(['y', 'z'].slice(1))
    expect(findOverlaps(list, 100, 110).map((o) => o.key)).toEqual(['y', 'z'])
  })
})

describe('planning', () => {
  const at = (s: string) => Temporal.ZonedDateTime.from(`${s}[UTC]`)
  const event = (key: string, start: string, end: string, resourceIds: string[] = []) =>
    ({
      key,
      id: key,
      event: {},
      start: at(start),
      end: at(end),
      startMs: at(start).epochMilliseconds,
      endMs: at(end).epochMilliseconds,
      allDay: false,
      resourceIds,
    }) as unknown as EventOccurrence<unknown>

  it('finds free time for everyone', () => {
    const list = [
      event('a', '2026-06-15T09:00', '2026-06-15T10:00', ['x']),
      event('b', '2026-06-15T10:30', '2026-06-15T12:00', ['y']),
      event('c', '2026-06-15T09:00', '2026-06-15T17:00', ['z']),
    ]
    const slots = findFreeSlots(list, {
      durationMinutes: 60,
      from: at('2026-06-15T09:00'),
      to: at('2026-06-15T14:00'),
      resourceIds: ['x', 'y'],
      stepMinutes: 30,
    })
    expect(slots.map((s) => s.start.toPlainTime().toString().slice(0, 5))).toEqual([
      '12:00',
      '12:30',
      '13:00',
    ])
    expect(
      nextFreeSlot(list, {
        durationMinutes: 30,
        from: at('2026-06-15T09:10'),
        to: at('2026-06-15T18:00'),
        resourceIds: ['x'],
      })
        ?.start.toPlainTime()
        .toString()
        .slice(0, 5),
    ).toBe('10:00')
  })

  it('respects business hours and blocked times', () => {
    const slots = findFreeSlots([], {
      durationMinutes: 60,
      from: at('2026-06-15T07:00'),
      to: at('2026-06-15T19:00'),
      businessHours: OFFICE,
      blocked: [
        {
          startMs: at('2026-06-15T09:00').epochMilliseconds,
          endMs: at('2026-06-15T16:00').epochMilliseconds,
          resourceIds: undefined,
          source: { start: 0, end: 0 },
        },
      ],
      stepMinutes: 60,
    })
    expect(slots.map((s) => s.start.hour)).toEqual([16])
  })

  it('groups conflicts per resource', () => {
    const conflicts = findConflicts([
      event('a', '2026-06-15T09:00', '2026-06-15T11:00', ['x']),
      event('b', '2026-06-15T10:00', '2026-06-15T12:00', ['x']),
      event('c', '2026-06-15T11:30', '2026-06-15T13:00', ['x']),
      event('d', '2026-06-15T14:00', '2026-06-15T15:00', ['x']),
      event('e', '2026-06-15T09:00', '2026-06-15T11:00', ['y']),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.resourceId).toBe('x')
    expect(conflicts[0]!.occurrences.map((o) => o.key)).toEqual(['a', 'b', 'c'])
  })

  it('finds hours that suit several zones', () => {
    expect(
      overlapHours(
        MONDAY,
        [
          { timeZone: 'Europe/Brussels', start: '09:00', end: '17:00' },
          { timeZone: 'America/New_York', start: '09:00', end: '17:00' },
        ],
        'Europe/Brussels',
      ),
    ).toEqual([{ start: 900, end: 1020 }])
    expect(
      overlapHours(
        MONDAY,
        [
          { timeZone: 'Europe/Brussels', start: '09:00', end: '12:00' },
          { timeZone: 'Asia/Tokyo', start: '20:00', end: '23:00' },
        ],
        'Europe/Brussels',
      ),
    ).toEqual([])
  })

  it('finds empty stretches on slot boundaries', () => {
    expect(emptyStretches([{ start: 545, end: 600 }], 0, 1440, 120, 30)).toEqual([
      { start: 0, end: 540 },
      { start: 600, end: 1440 },
    ])
    expect(emptyStretches([{ start: 60, end: 120 }], 0, 180, 120, 30)).toEqual([])
  })

  it('offers scopes for recurring events only', () => {
    expect(recurrenceScopeOptions({ recurring: false, isException: false })).toEqual([])
    expect(
      recurrenceScopeOptions({ recurring: true, isException: false }).map((o) => o.scope),
    ).toEqual(['this', 'following', 'all'])
  })
})
