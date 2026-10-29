import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import {
  formatDate,
  formatDateRange,
  formatTime,
  formatTimeOfDay,
  weekStartForLocale,
} from '../format'

const d = (s: string) => Temporal.PlainDate.from(s)

describe('format', () => {
  it('formats plain dates without shifting them by the runtime zone', () => {
    expect(formatDate(d('2026-10-29'), 'en-GB', { day: 'numeric', month: 'long' })).toBe(
      '29 October',
    )
    expect(formatDate(d('0099-01-01'), 'en-GB', { year: 'numeric' })).toBe('99')
  })

  it('formats ranges', () => {
    const out = formatDateRange(d('2026-10-26'), d('2026-11-01'), 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    expect(out.replace(/\s/g, ' ')).toBe('26 Oct – 1 Nov 2026')
  })

  it('formats wall-clock times by locale or forced clock', () => {
    expect(formatTimeOfDay(570, 'en-GB')).toBe('09:30')
    expect(formatTimeOfDay(570, 'en-US').replace(/\s/g, ' ')).toBe('9:30 AM')
    expect(formatTimeOfDay(540, 'en-US', { compact: true }).replace(/\s/g, ' ')).toBe('9 AM')
    expect(formatTimeOfDay(540, 'en-GB', { compact: true })).toBe('09:00')
    expect(formatTimeOfDay(840, 'en-GB', { hour12: true }).replace(/\s/g, ' ')).toBe('2:00 pm')
    const z = Temporal.ZonedDateTime.from('2026-10-29T09:30:00+01:00[Europe/Brussels]')
    expect(formatTime(z, 'en-GB')).toBe('09:30')
  })

  it('reads the week start from the locale', () => {
    expect(weekStartForLocale('en-GB')).toBe(1)
    expect(weekStartForLocale('en-US')).toBe(7)
    expect(weekStartForLocale('not a locale!')).toBe(1)
  })
})
