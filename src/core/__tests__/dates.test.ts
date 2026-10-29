import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import { DateParseError, dayBounds, parseDateInput, startOfWeek, toZoned } from '../dates'
import { isoAdapter, nativeDateAdapter } from '../date-adapter'
import {
  dayStrategy,
  monthStrategy,
  rangeDays,
  rangeToWindow,
  weekStrategy,
  yearStrategy,
} from '../range'

const BXL = 'Europe/Brussels'
const d = (s: string) => Temporal.PlainDate.from(s)

describe('parseDateInput', () => {
  it('reads date-only strings as dates', () => {
    expect(parseDateInput('2026-10-29')).toEqual({ kind: 'date', date: d('2026-10-29') })
  })

  it('reads strings without offset as floating wall-clock time', () => {
    const parsed = parseDateInput('2026-10-29T09:30')
    expect(parsed.kind).toBe('floating')
    expect(toZoned('2026-10-29T09:30', BXL).toString()).toBe(
      '2026-10-29T09:30:00+01:00[Europe/Brussels]',
    )
  })

  it('reads offsets, Z and bracketed zones as exact instants', () => {
    expect(toZoned('2026-10-29T08:30Z', BXL).toString()).toBe(
      '2026-10-29T09:30:00+01:00[Europe/Brussels]',
    )
    expect(toZoned('2026-10-29T09:30+01:00', 'UTC').hour).toBe(8)
    expect(toZoned('2026-10-29T09:30:00+01:00[Europe/Brussels]', 'UTC').hour).toBe(8)
  })

  it('reads numbers, Dates and Temporal objects', () => {
    const ms = Date.UTC(2026, 9, 29, 8, 30)
    expect(toZoned(ms, BXL).hour).toBe(9)
    expect(toZoned(new Date(ms), BXL).hour).toBe(9)
    expect(parseDateInput(d('2026-10-29')).kind).toBe('date')
    expect(parseDateInput(Temporal.PlainDateTime.from('2026-10-29T09:00')).kind).toBe('floating')
    expect(parseDateInput(Temporal.Instant.fromEpochMilliseconds(ms)).kind).toBe('exact')
  })

  it('rejects garbage', () => {
    expect(() => parseDateInput('not a date')).toThrow(DateParseError)
    expect(() => parseDateInput(new Date(NaN))).toThrow(DateParseError)
    expect(() => parseDateInput({})).toThrow(DateParseError)
    expect(() => parseDateInput(NaN)).toThrow(DateParseError)
  })
})

describe('date helpers', () => {
  it('startOfWeek respects the week start', () => {
    expect(startOfWeek(d('2026-10-29'), 1).toString()).toBe('2026-10-26')
    expect(startOfWeek(d('2026-10-29'), 7).toString()).toBe('2026-10-25')
    expect(startOfWeek(d('2026-10-26'), 1).toString()).toBe('2026-10-26')
  })

  it('days are 23 or 25 hours long on DST changes', () => {
    const len = (s: string) => {
      const b = dayBounds(d(s), BXL)
      return (b.endMs - b.startMs) / 3_600_000
    }
    expect(len('2026-03-29')).toBe(23)
    expect(len('2026-10-25')).toBe(25)
    expect(len('2026-10-26')).toBe(24)
  })

  it('handles zones where midnight does not exist', () => {
    // Santiago springs forward at 00:00, so the day starts at 01:00.
    expect(dayBounds(d('2026-09-06'), 'America/Santiago').startMs).toBe(
      Temporal.ZonedDateTime.from('2026-09-06T01:00[America/Santiago]').epochMilliseconds,
    )
  })

  it('adapters convert output values', () => {
    const z = Temporal.ZonedDateTime.from('2026-10-29T09:30:00+01:00[Europe/Brussels]')
    expect(isoAdapter.output(z, false)).toBe('2026-10-29T09:30:00+01:00')
    expect(isoAdapter.output(z, true)).toBe('2026-10-29')
    expect(nativeDateAdapter.output(z, false).getTime()).toBe(z.epochMilliseconds)
  })
})

describe('range strategies', () => {
  const s = (r: { start: Temporal.PlainDate; end: Temporal.PlainDate }) => `${r.start}..${r.end}`

  it('day and N-day ranges', () => {
    expect(s(dayStrategy().range(d('2026-10-29')))).toBe('2026-10-29..2026-10-30')
    const three = dayStrategy({ days: 3 })
    expect(s(three.range(d('2026-10-29')))).toBe('2026-10-29..2026-11-01')
    expect(three.step(d('2026-10-29'), -1).toString()).toBe('2026-10-26')
  })

  it('week and work-week ranges', () => {
    expect(s(weekStrategy().range(d('2026-10-29')))).toBe('2026-10-26..2026-11-02')
    expect(s(weekStrategy({ weekStart: 7 }).range(d('2026-10-29')))).toBe('2026-10-25..2026-11-01')
    expect(s(weekStrategy({ days: 5 }).range(d('2026-10-29')))).toBe('2026-10-26..2026-10-31')
    expect(s(weekStrategy({ weeks: 2 }).range(d('2026-10-29')))).toBe('2026-10-26..2026-11-09')
  })

  it('month range pads to whole weeks and keeps the month as the active range', () => {
    const r = monthStrategy().range(d('2026-10-29'))
    expect(s(r)).toBe('2026-09-28..2026-11-02')
    expect(s(r.active)).toBe('2026-10-01..2026-11-01')
    expect(s(monthStrategy({ fixedWeeks: true }).range(d('2026-10-29')))).toBe(
      '2026-09-28..2026-11-09',
    )
    // February 2027 starts on a Monday and has exactly four weeks.
    expect(s(monthStrategy().range(d('2027-02-10')))).toBe('2027-02-01..2027-03-01')
    expect(monthStrategy().step(d('2026-01-31'), 1).toString()).toBe('2026-02-28')
  })

  it('year range', () => {
    expect(s(yearStrategy().range(d('2026-10-29')))).toBe('2026-01-01..2027-01-01')
  })

  it('rangeDays hides weekdays; rangeToWindow follows the zone', () => {
    const week = weekStrategy().range(d('2026-10-29'))
    expect(rangeDays(week, [6, 7]).map(String)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ])
    const w = rangeToWindow({ start: d('2026-10-25'), end: d('2026-10-26') }, BXL)
    expect((w.endMs - w.startMs) / 3_600_000).toBe(25)
  })
})
