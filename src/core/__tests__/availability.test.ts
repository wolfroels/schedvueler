import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import {
  closedIntervals,
  findBlocked,
  findOverlaps,
  fitsBusinessHours,
  openIntervals,
} from '../availability'
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
