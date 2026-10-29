import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import { parseDateInput } from '../dates'
import {
  RRuleError,
  expandSeries,
  parseRRule,
  stringifyRRule,
  takeOccurrences,
  truncateRuleBefore,
  type RecurrenceSeries,
  type RecurrenceStart,
} from '../recurrence'

const NY = 'America/New_York'

function series(
  start: string,
  rrule: string,
  extra: Partial<RecurrenceSeries> = {},
): RecurrenceSeries {
  const startValue = start.includes('T')
    ? Temporal.PlainDateTime.from(start)
    : Temporal.PlainDate.from(start)
  return { rule: parseRRule(rrule), start: startValue, timeZone: NY, ...extra }
}

/** Formats occurrences as local wall-clock strings, e.g. `1997-09-02T09:00`. */
function local(values: RecurrenceStart[]): string[] {
  return values.map((v) =>
    'timeZoneId' in v ? v.toPlainDateTime().toString({ smallestUnit: 'minute' }) : v.toString(),
  )
}

function dates(values: RecurrenceStart[]): string[] {
  return values.map((v) => ('timeZoneId' in v ? v.toPlainDate().toString() : v.toString()))
}

describe('parseRRule / stringifyRRule', () => {
  it('parses all parts and round-trips', () => {
    const text =
      'FREQ=MONTHLY;INTERVAL=2;COUNT=10;WKST=SU;BYMONTH=1,3;BYDAY=1MO,-1FR,TU;BYSETPOS=-1'
    const rule = parseRRule('RRULE:' + text)
    expect(rule.freq).toBe('MONTHLY')
    expect(rule.interval).toBe(2)
    expect(rule.byDay).toEqual([{ weekday: 1, nth: 1 }, { weekday: 5, nth: -1 }, { weekday: 2 }])
    expect(rule.wkst).toBe(7)
    expect(stringifyRRule(rule)).toBe(text)
  })

  it('parses the three UNTIL forms', () => {
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231').until).toMatchObject({ kind: 'date' })
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231T120000').until).toMatchObject({ kind: 'floating' })
    const exact = parseRRule('FREQ=DAILY;UNTIL=20261231T120000Z')
    expect(exact.until).toMatchObject({ kind: 'exact' })
    expect(stringifyRRule(exact)).toBe('FREQ=DAILY;UNTIL=20261231T120000Z')
  })

  it('rejects invalid rules', () => {
    expect(() => parseRRule('INTERVAL=2')).toThrow(RRuleError)
    expect(() => parseRRule('FREQ=SECONDLY')).toThrow(RRuleError)
    expect(() => parseRRule('FREQ=DAILY;COUNT=2;UNTIL=20260101')).toThrow(RRuleError)
    expect(() => parseRRule('FREQ=DAILY;BYDAY=XX')).toThrow(RRuleError)
    expect(() => parseRRule('FREQ=MONTHLY;BYWEEKNO=3')).toThrow(RRuleError)
    expect(() => parseRRule('FREQ=DAILY;BYMONTH=13')).toThrow(RRuleError)
    expect(() => parseRRule('FREQ=DAILY;UNTIL=20260230')).toThrow(RRuleError)
  })
})

// Examples from RFC 5545 §3.8.5.3, DTSTART in America/New_York.
describe('RFC 5545 examples', () => {
  it('daily for 10 occurrences', () => {
    const out = takeOccurrences(series('1997-09-02T09:00', 'FREQ=DAILY;COUNT=10'), 100)
    expect(dates(out)).toEqual([
      '1997-09-02',
      '1997-09-03',
      '1997-09-04',
      '1997-09-05',
      '1997-09-06',
      '1997-09-07',
      '1997-09-08',
      '1997-09-09',
      '1997-09-10',
      '1997-09-11',
    ])
  })

  it('weekly for 10 occurrences keeps 09:00 local across the DST change', () => {
    const out = takeOccurrences(
      series('1997-09-02T09:00', 'FREQ=WEEKLY;COUNT=10'),
      100,
    ) as Temporal.ZonedDateTime[]
    expect(dates(out)).toEqual([
      '1997-09-02',
      '1997-09-09',
      '1997-09-16',
      '1997-09-23',
      '1997-09-30',
      '1997-10-07',
      '1997-10-14',
      '1997-10-21',
      '1997-10-28',
      '1997-11-04',
    ])
    expect(out.every((z) => z.hour === 9)).toBe(true)
    expect(out[0]!.offset).toBe('-04:00')
    expect(out[9]!.offset).toBe('-05:00')
  })

  it('every other week on Mon, Wed, Fri until Dec 24 1997', () => {
    const out = takeOccurrences(
      series(
        '1997-09-01T09:00',
        'FREQ=WEEKLY;INTERVAL=2;UNTIL=19971224T000000Z;WKST=SU;BYDAY=MO,WE,FR',
      ),
      100,
    )
    expect(dates(out)).toEqual([
      '1997-09-01',
      '1997-09-03',
      '1997-09-05',
      '1997-09-15',
      '1997-09-17',
      '1997-09-19',
      '1997-09-29',
      '1997-10-01',
      '1997-10-03',
      '1997-10-13',
      '1997-10-15',
      '1997-10-17',
      '1997-10-27',
      '1997-10-29',
      '1997-10-31',
      '1997-11-10',
      '1997-11-12',
      '1997-11-14',
      '1997-11-24',
      '1997-11-26',
      '1997-11-28',
      '1997-12-08',
      '1997-12-10',
      '1997-12-12',
      '1997-12-22',
    ])
  })

  it('weekly with WKST changes which days fall in the same week', () => {
    const mo = takeOccurrences(
      series('1997-08-05T09:00', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO'),
      10,
    )
    expect(dates(mo)).toEqual(['1997-08-05', '1997-08-10', '1997-08-19', '1997-08-24'])
    const su = takeOccurrences(
      series('1997-08-05T09:00', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU'),
      10,
    )
    expect(dates(su)).toEqual(['1997-08-05', '1997-08-17', '1997-08-19', '1997-08-31'])
  })

  it('monthly on the first Friday', () => {
    const out = takeOccurrences(series('1997-09-05T09:00', 'FREQ=MONTHLY;COUNT=10;BYDAY=1FR'), 100)
    expect(dates(out)).toEqual([
      '1997-09-05',
      '1997-10-03',
      '1997-11-07',
      '1997-12-05',
      '1998-01-02',
      '1998-02-06',
      '1998-03-06',
      '1998-04-03',
      '1998-05-01',
      '1998-06-05',
    ])
  })

  it('monthly on the second-to-last Monday', () => {
    const out = takeOccurrences(series('1997-09-22T09:00', 'FREQ=MONTHLY;COUNT=6;BYDAY=-2MO'), 100)
    expect(dates(out)).toEqual([
      '1997-09-22',
      '1997-10-20',
      '1997-11-17',
      '1997-12-22',
      '1998-01-19',
      '1998-02-16',
    ])
  })

  it('Monday of week number 20', () => {
    const out = takeOccurrences(series('1997-05-12T09:00', 'FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO'), 3)
    expect(dates(out)).toEqual(['1997-05-12', '1998-05-11', '1999-05-17'])
  })

  it('every 20th Monday of the year', () => {
    const out = takeOccurrences(series('1997-05-19T09:00', 'FREQ=YEARLY;BYDAY=20MO'), 3)
    expect(dates(out)).toEqual(['1997-05-19', '1998-05-18', '1999-05-17'])
  })

  it('every Friday the 13th, with DTSTART excluded', () => {
    const out = takeOccurrences(
      series('1997-09-02T09:00', 'FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13', {
        exdates: [parseDateInput('1997-09-02T09:00')],
      }),
      5,
    )
    expect(dates(out)).toEqual([
      '1998-02-13',
      '1998-03-13',
      '1998-11-13',
      '1999-08-13',
      '2000-10-13',
    ])
  })

  it('last work day of the month (BYSETPOS=-1)', () => {
    const out = takeOccurrences(
      series('1997-09-30T09:00', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'),
      7,
    )
    expect(dates(out)).toEqual([
      '1997-09-30',
      '1997-10-31',
      '1997-11-28',
      '1997-12-31',
      '1998-01-30',
      '1998-02-27',
      '1998-03-31',
    ])
  })

  it('third Tue/Wed/Thu of the month', () => {
    const out = takeOccurrences(
      series('1997-09-04T09:00', 'FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3'),
      10,
    )
    expect(dates(out)).toEqual(['1997-09-04', '1997-10-07', '1997-11-06'])
  })

  it('yearly in June and July', () => {
    const out = takeOccurrences(series('1997-06-10T09:00', 'FREQ=YEARLY;COUNT=10;BYMONTH=6,7'), 100)
    expect(dates(out)).toEqual([
      '1997-06-10',
      '1997-07-10',
      '1998-06-10',
      '1998-07-10',
      '1999-06-10',
      '1999-07-10',
      '2000-06-10',
      '2000-07-10',
      '2001-06-10',
      '2001-07-10',
    ])
  })

  it('every other year in Jan, Feb and Mar', () => {
    const out = takeOccurrences(
      series('1997-03-10T09:00', 'FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3'),
      100,
    )
    expect(dates(out)).toEqual([
      '1997-03-10',
      '1999-01-10',
      '1999-02-10',
      '1999-03-10',
      '2001-01-10',
      '2001-02-10',
      '2001-03-10',
      '2003-01-10',
      '2003-02-10',
      '2003-03-10',
    ])
  })

  it('every 15 minutes for 6 occurrences', () => {
    const out = takeOccurrences(series('1997-09-02T09:00', 'FREQ=MINUTELY;INTERVAL=15;COUNT=6'), 10)
    expect(local(out)).toEqual([
      '1997-09-02T09:00',
      '1997-09-02T09:15',
      '1997-09-02T09:30',
      '1997-09-02T09:45',
      '1997-09-02T10:00',
      '1997-09-02T10:15',
    ])
  })

  it('daily at several times via BYHOUR and BYMINUTE', () => {
    const out = takeOccurrences(
      series('1997-09-02T09:00', 'FREQ=DAILY;BYHOUR=9,10;BYMINUTE=0,30;COUNT=5'),
      10,
    )
    expect(local(out)).toEqual([
      '1997-09-02T09:00',
      '1997-09-02T09:30',
      '1997-09-02T10:00',
      '1997-09-02T10:30',
      '1997-09-03T09:00',
    ])
  })
})

describe('edge cases', () => {
  it('skips months without the day (no clamping to the 30th)', () => {
    const out = takeOccurrences(series('2007-01-31T10:00', 'FREQ=MONTHLY;COUNT=5'), 10)
    expect(dates(out)).toEqual([
      '2007-01-31',
      '2007-03-31',
      '2007-05-31',
      '2007-07-31',
      '2007-08-31',
    ])
  })

  it('negative BYMONTHDAY picks the last day of each month', () => {
    const out = takeOccurrences(
      series('2026-01-31T10:00', 'FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3'),
      10,
    )
    expect(dates(out)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('leap day repeats only in leap years', () => {
    const out = takeOccurrences(series('2024-02-29', 'FREQ=YEARLY;COUNT=3'), 10)
    expect(dates(out)).toEqual(['2024-02-29', '2028-02-29', '2032-02-29'])
  })

  it('stops on rules that can never match', () => {
    const out = takeOccurrences(series('2026-01-01', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30'), 10)
    expect(dates(out)).toEqual(['2026-01-01'])
  })

  it('daily 09:00 Europe/Brussels stays 09:00 through spring forward and fall back', () => {
    const s = series('2026-03-27T09:00', 'FREQ=DAILY;COUNT=4', { timeZone: 'Europe/Brussels' })
    const out = takeOccurrences(s, 10) as Temporal.ZonedDateTime[]
    expect(out.map((z) => z.toString({ timeZoneName: 'never' }))).toEqual([
      '2026-03-27T09:00:00+01:00',
      '2026-03-28T09:00:00+01:00',
      '2026-03-29T09:00:00+02:00',
      '2026-03-30T09:00:00+02:00',
    ])
    const fall = takeOccurrences(
      series('2026-10-24T09:00', 'FREQ=DAILY;COUNT=3', { timeZone: 'Europe/Brussels' }),
      10,
    )
    expect(fall.map((z) => z.toString())).toEqual([
      '2026-10-24T09:00:00+02:00[Europe/Brussels]',
      '2026-10-25T09:00:00+01:00[Europe/Brussels]',
      '2026-10-26T09:00:00+01:00[Europe/Brussels]',
    ])
  })

  it('moves a time that does not exist on the spring-forward day forward by the gap', () => {
    const s = series('2026-03-28T02:30', 'FREQ=DAILY;COUNT=3', { timeZone: 'Europe/Brussels' })
    expect(local(takeOccurrences(s, 10))).toEqual([
      '2026-03-28T02:30',
      '2026-03-29T03:30',
      '2026-03-30T02:30',
    ])
  })

  it('date-only EXDATE removes all occurrences that day; RDATE adds extra ones', () => {
    const s = series('2026-11-02T09:00', 'FREQ=DAILY;COUNT=4', {
      exdates: [parseDateInput('2026-11-03')],
      rdates: [parseDateInput('2026-11-10T14:00')],
    })
    expect(local(takeOccurrences(s, 10))).toEqual([
      '2026-11-02T09:00',
      '2026-11-04T09:00',
      '2026-11-05T09:00',
      '2026-11-10T14:00',
    ])
  })
})

describe('expandSeries', () => {
  const window = (start: string, end: string, tz = NY) => ({
    startMs: Temporal.PlainDate.from(start).toZonedDateTime(tz).epochMilliseconds,
    endMs: Temporal.PlainDate.from(end).toZonedDateTime(tz).epochMilliseconds,
  })

  it('only returns occurrences that overlap the window', () => {
    const s = series('2020-01-06T09:00', 'FREQ=WEEKLY;BYDAY=MO,TH')
    const out = expandSeries(s, window('2026-10-26', '2026-11-02'), {
      displayTimeZone: NY,
      durationMs: 3600_000,
    })
    expect(local(out)).toEqual(['2026-10-26T09:00', '2026-10-29T09:00'])
  })

  it('includes an occurrence that started before the window but is still running', () => {
    const s = series('2026-10-01T22:00', 'FREQ=DAILY')
    const out = expandSeries(s, window('2026-10-10', '2026-10-11'), {
      displayTimeZone: NY,
      durationMs: 4 * 3600_000,
    })
    expect(local(out)).toEqual(['2026-10-09T22:00', '2026-10-10T22:00'])
  })

  it('fast-forwarding gives the same result as iterating from the start', () => {
    const s = series('2001-03-15T08:30', 'FREQ=MONTHLY;INTERVAL=3;BYDAY=2TU,-1FR')
    const w = window('2026-01-01', '2027-01-01')
    const fast = expandSeries(s, w, { displayTimeZone: NY, durationMs: 1800_000 })
    const slow = takeOccurrences(s, 10_000).filter((z) => {
      const ms = (z as Temporal.ZonedDateTime).epochMilliseconds
      return ms >= w.startMs && ms < w.endMs
    })
    expect(local(fast)).toEqual(local(slow))
    expect(fast.length).toBeGreaterThan(0)
  })

  it('places all-day series using the display zone', () => {
    const s = series('2026-10-01', 'FREQ=WEEKLY;BYDAY=TH', { timeZone: 'Asia/Tokyo' })
    const out = expandSeries(s, window('2026-10-26', '2026-11-02', 'Europe/Brussels'), {
      displayTimeZone: 'Europe/Brussels',
      durationDays: 1,
    })
    expect(dates(out)).toEqual(['2026-10-29'])
  })
})

describe('truncateRuleBefore', () => {
  it('converts to UNTIL one second before the split, in UTC', () => {
    const s = series('2026-10-01T09:00', 'FREQ=DAILY')
    const split = Temporal.ZonedDateTime.from('2026-10-05T09:00[America/New_York]')
    const rule = truncateRuleBefore(s, split)!
    expect(stringifyRRule(rule)).toBe('FREQ=DAILY;UNTIL=20261005T125959Z')
    expect(dates(takeOccurrences({ ...s, rule }, 100))).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
  })

  it('keeps COUNT rules count-based', () => {
    const s = series('2026-10-01T09:00', 'FREQ=DAILY;COUNT=10')
    const rule = truncateRuleBefore(
      s,
      Temporal.ZonedDateTime.from('2026-10-04T09:00[America/New_York]'),
    )
    expect(rule?.count).toBe(3)
  })

  it('returns null when splitting at the first occurrence', () => {
    const s = series('2026-10-01', 'FREQ=DAILY')
    expect(truncateRuleBefore(s, Temporal.PlainDate.from('2026-10-01'))).toBeNull()
  })
})
