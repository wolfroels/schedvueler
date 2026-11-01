import { describe, expect, it } from 'vitest'
import { Temporal } from '../temporal'
import {
  contrastRatio,
  createTheme,
  defaultCsvColumns,
  diffEvents,
  occurrencesToCsv,
  occurrencesToJson,
  parseQuickAdd,
  readableTextColor,
} from '../data-tools'
import { parseICal, stringifyICal } from '../ical'
import { EventStore } from '../events'
import {
  defaultRecurrenceForm,
  formToRecurrence,
  recurrenceToForm,
  recurrenceToText,
} from '../recurrence'
import type { SchedulerEvent } from '../types'

const d = (s: string) => Temporal.PlainDate.from(s)
const BXL = 'Europe/Brussels'

describe('iCalendar', () => {
  const SAMPLE = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Brussels',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    'UID:one',
    'SUMMARY:Lunch\\, with a very long title that goes on and on and on and on and on and',
    '  on past the limit',
    'DTSTART;TZID=Europe/Brussels:20261030T120000',
    'DTEND;TZID=Europe/Brussels:20261030T130000',
    'RRULE:FREQ=WEEKLY;COUNT=3',
    'EXDATE;TZID=Europe/Brussels:20261106T120000',
    'BEGIN:VALARM',
    'SUMMARY:Not the title',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:one',
    'RECURRENCE-ID;TZID=Europe/Brussels:20261113T120000',
    'SUMMARY:Moved',
    'DTSTART;TZID=Europe/Brussels:20261113T140000',
    'DURATION:PT1H',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:day',
    'SUMMARY:Holiday',
    'DTSTART;VALUE=DATE:20261225',
    'DTEND;VALUE=DATE:20261226',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:bad',
    'DTSTART;TZID=Nowhere/Land:20261225T100000',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  it('reads events, rules, exceptions and folded lines', () => {
    const { events, warnings } = parseICal(SAMPLE)
    expect(events).toHaveLength(3)
    expect(events[0]).toMatchObject({
      id: 'one',
      timezone: BXL,
      rrule: 'FREQ=WEEKLY;COUNT=3',
    })
    expect(events[0]!.title).toMatch(/^Lunch, with .* on past the limit$/)
    expect(events[0]!.exdates).toHaveLength(1)
    expect(events[1]).toMatchObject({ recurringEventId: 'one', title: 'Moved' })
    expect(String(events[1]!.end)).toContain('15:00')
    expect(events[2]).toMatchObject({ start: '2026-12-25', end: '2026-12-26', allDay: true })
    expect(warnings[0]).toContain('Nowhere/Land')
  })

  it('reads back what it writes, with the same occurrences', () => {
    const events: SchedulerEvent[] = [
      {
        id: 'a',
        title: 'Semi; colon, comma\nand line',
        start: '2026-10-30T09:00:00',
        end: '2026-10-30T10:00:00',
        timezone: BXL,
        rrule: 'FREQ=DAILY;COUNT=4',
        exdates: ['2026-10-31T09:00:00'],
      },
      { id: 'b', title: 'Day', start: '2026-12-25', end: '2026-12-27' },
      { id: 'c', title: 'Exact', start: '2026-11-01T08:00:00Z', end: '2026-11-01T09:00:00Z' },
    ]
    const text = stringifyICal(events, { stamp: Temporal.Instant.from('2026-01-01T00:00:00Z') })
    expect(text).toContain('BEGIN:VTIMEZONE')
    expect(text).toContain('TZOFFSETTO:+0100')
    expect(text.split('\r\n').every((l) => l.length <= 75)).toBe(true)

    const { events: back, warnings } = parseICal(text)
    expect(warnings).toEqual([])
    const window = {
      startMs: Date.UTC(2026, 9, 1),
      endMs: Date.UTC(2027, 0, 31),
    }
    const shape = (list: SchedulerEvent[]) =>
      new EventStore(list, { timeZone: BXL })
        .query(window)
        .map((o) => [o.start.toString(), o.end.toString(), o.allDay, o.event.title])
    expect(shape(back)).toEqual(shape(events))
  })
})

describe('recurrence in words', () => {
  it('describes rules', () => {
    expect(recurrenceToText('FREQ=DAILY')).toBe('Every day')
    expect(recurrenceToText('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR', { locale: 'en-GB' })).toBe(
      'Every 2 weeks on Monday and Friday',
    )
    expect(recurrenceToText('FREQ=MONTHLY;BYDAY=-1FR', { locale: 'en-GB' })).toBe(
      'Every month on the last Friday',
    )
    expect(recurrenceToText('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=2', { locale: 'en-GB' })).toBe(
      'Every month on the second Friday',
    )
    expect(recurrenceToText('FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3')).toBe(
      'Every month on day 15, 3 times',
    )
    expect(recurrenceToText('FREQ=YEARLY;BYMONTH=3;UNTIL=20300101', { locale: 'en-GB' })).toBe(
      'Every year in March, until 1 January 2030',
    )
  })

  it('goes between rules and form fields', () => {
    const start = d('2026-06-15')
    const form = defaultRecurrenceForm(start)
    expect(formToRecurrence(form)).toBe('FREQ=WEEKLY;BYDAY=MO')
    expect(
      formToRecurrence({ ...form, interval: 2, weekdays: [5, 1], endType: 'count', count: 4 }),
    ).toBe('FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=MO,FR')
    const monthly = recurrenceToForm('FREQ=MONTHLY;BYDAY=2TU;UNTIL=20270101', start)
    expect(monthly).toMatchObject({
      monthlyMode: 'weekday',
      nth: 2,
      nthWeekday: 2,
      endType: 'until',
      until: '2027-01-01',
    })
    expect(formToRecurrence(monthly)).toContain('BYDAY=2TU')
    expect(
      recurrenceToForm(formToRecurrence({ ...form, freq: 'MONTHLY', monthDay: 9 }), start),
    ).toMatchObject({
      freq: 'MONTHLY',
      monthlyMode: 'day',
      monthDay: 9,
    })
  })
})

describe('export', () => {
  const store = new EventStore<SchedulerEvent>(
    [
      { id: 'a', title: 'He said "hi", ok', start: '2026-06-15T09:00', end: '2026-06-15T10:00' },
      {
        id: 'b',
        title: '=SUM(A1)',
        start: '2026-06-16',
        end: '2026-06-18',
        resourceIds: ['r1', 'r2'],
      },
    ],
    { timeZone: BXL },
  )
  const list = store.query({ startMs: Date.UTC(2026, 5, 1), endMs: Date.UTC(2026, 6, 1) })

  it('writes CSV, quoted and safe in spreadsheets', () => {
    const csv = occurrencesToCsv(
      list,
      defaultCsvColumns<SchedulerEvent>((e) => e.title),
    )
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('Title,Start,End,All day,Resources')
    expect(csv).toContain('"He said ""hi"", ok",2026-06-15T09:00:00,2026-06-15T10:00:00,false,')
    expect(csv).toContain("'=SUM(A1),2026-06-16,2026-06-17,true,r1 r2")
  })

  it('writes JSON', () => {
    const data = JSON.parse(occurrencesToJson(list))
    expect(data).toHaveLength(2)
    expect(data.find((o: { id: string }) => o.id === 'b')).toMatchObject({
      start: '2026-06-16',
      allDay: true,
    })
  })
})

describe('change tracking', () => {
  it('finds created, updated and deleted events', () => {
    const a = { id: 1, title: 'A' }
    const b = { id: 2, title: 'B' }
    const c = { id: 3, title: 'C' }
    const same = { id: 1, title: 'A' }
    const changed = { id: 2, title: 'B2' }
    expect(diffEvents([a, b, c], [same, changed, { id: 4 }])).toEqual({
      created: [{ id: 4 }],
      updated: [{ before: b, after: changed }],
      deleted: [c],
    })
  })
})

describe('colors', () => {
  it('measures contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(readableTextColor('#ffff00')).toBe('#000000')
    expect(readableTextColor('#1e3a8a')).toBe('#ffffff')
    expect(createTheme('#0f766e')['--orb-color-accent-contrast']).toBe('#ffffff')
  })
})

describe('quick add', () => {
  const today = d('2026-06-15') // A Monday.
  const read = (text: string) => parseQuickAdd(text, { today, locale: 'en-GB' })

  it('reads weekdays, times and lengths', () => {
    const r = read('Lunch friday 12:30 for 1h')
    expect(r.title).toBe('Lunch')
    expect(r.start.toString()).toBe('2026-06-19T12:30:00')
    expect(r.durationMinutes).toBe(60)
  })

  it('reads other forms', () => {
    expect(read('Call tomorrow at 3pm').start.toString()).toBe('2026-06-16T15:00:00')
    expect(read('Trip 2026-07-01').start.toString()).toBe('2026-07-01')
    expect(read('Standup 9:15 for 15 min').durationMinutes).toBe(15)
    expect(read('Just a title')).toMatchObject({ title: 'Just a title' })
    expect(read('Just a title').start.toString()).toBe('2026-06-15')
    // Today's weekday means today, and past ones next week.
    expect(read('Review monday').start.toString()).toBe('2026-06-15')
    expect(read('Plan sunday').start.toString()).toBe('2026-06-21')
  })

  it('reads the weekdays of the locale', () => {
    const r = parseQuickAdd('Lunch vrijdag 12:30', { today, locale: 'nl-BE' })
    expect(r.title).toBe('Lunch')
    expect(r.start.toString()).toBe('2026-06-19T12:30:00')
  })
})
