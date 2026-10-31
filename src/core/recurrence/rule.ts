import { Temporal } from '../temporal'
import type { ParsedDate } from '../dates'

export type Frequency = 'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY'

export interface WeekdayRule {
  /** ISO weekday: 1 = Monday ... 7 = Sunday. */
  weekday: number
  /** Ordinal within the month or year, e.g. `1` = first, `-1` = last. */
  nth?: number
}

/** A parsed RFC 5545 recurrence rule. Weekdays use ISO numbering (1 = Monday). */
export interface RecurrenceRule {
  freq: Frequency
  interval: number
  count?: number
  until?: ParsedDate
  /** Week start, ISO weekday. Default 1 (Monday). */
  wkst: number
  byMonth?: number[]
  byWeekNo?: number[]
  byYearDay?: number[]
  byMonthDay?: number[]
  byDay?: WeekdayRule[]
  byHour?: number[]
  byMinute?: number[]
  bySecond?: number[]
  bySetPos?: number[]
}

export class RRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RRuleError'
  }
}

const FREQUENCIES: readonly Frequency[] = [
  'YEARLY',
  'MONTHLY',
  'WEEKLY',
  'DAILY',
  'HOURLY',
  'MINUTELY',
]
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

function weekdayFromCode(code: string): number {
  const index = WEEKDAYS.indexOf(code as (typeof WEEKDAYS)[number])
  if (index < 0) throw new RRuleError(`Unknown weekday "${code}"`)
  return index + 1
}

export function weekdayCode(isoWeekday: number): string {
  const code = WEEKDAYS[isoWeekday - 1]
  if (!code) throw new RRuleError(`Invalid ISO weekday ${isoWeekday}`)
  return code
}

function intList(
  value: string,
  name: string,
  min: number,
  max: number,
  allowNegative: boolean,
): number[] {
  return value.split(',').map((part) => {
    const n = Number(part)
    const abs = Math.abs(n)
    if (!Number.isInteger(n) || (!allowNegative && n < 0) || abs < min || abs > max) {
      throw new RRuleError(`Invalid ${name} value "${part}"`)
    }
    return n
  })
}

/** Parses an RFC 5545 `UNTIL` value: `20261231`, `20261231T235959Z` or `20261231T235959`. */
function parseUntil(value: string): ParsedDate {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/i.exec(value)
  if (!match) throw new RRuleError(`Invalid UNTIL value "${value}"`)
  const [, y, mo, d, h, mi, s, z] = match
  const date = { year: +y!, month: +mo!, day: +d! }
  try {
    if (h === undefined)
      return { kind: 'date', date: Temporal.PlainDate.from(date, { overflow: 'reject' }) }
    const dateTime = Temporal.PlainDateTime.from(
      { ...date, hour: +h, minute: +mi!, second: +s! },
      { overflow: 'reject' },
    )
    return z
      ? { kind: 'exact', zdt: dateTime.toZonedDateTime('UTC') }
      : { kind: 'floating', dateTime }
  } catch {
    throw new RRuleError(`Invalid UNTIL value "${value}"`)
  }
}

/** Parses `FREQ=WEEKLY;BYDAY=MO,WE` (an `RRULE:` prefix is allowed). */
export function parseRRule(input: string): RecurrenceRule {
  const text = input.trim().replace(/^RRULE:/i, '')
  const parts = new Map<string, string>()
  for (const segment of text.split(';')) {
    if (!segment) continue
    const eq = segment.indexOf('=')
    if (eq < 1) throw new RRuleError(`Invalid rule part "${segment}"`)
    parts.set(segment.slice(0, eq).toUpperCase(), segment.slice(eq + 1).toUpperCase())
  }

  const freq = parts.get('FREQ') as Frequency | undefined
  if (!freq) throw new RRuleError('FREQ is required')
  if (!FREQUENCIES.includes(freq)) throw new RRuleError(`Unsupported FREQ "${freq}"`)

  const rule: RecurrenceRule = { freq, interval: 1, wkst: 1 }
  for (const [key, value] of parts) {
    switch (key) {
      case 'FREQ':
        break
      case 'INTERVAL':
        rule.interval = intList(value, key, 1, Number.MAX_SAFE_INTEGER, false)[0]!
        break
      case 'COUNT':
        rule.count = intList(value, key, 1, Number.MAX_SAFE_INTEGER, false)[0]!
        break
      case 'UNTIL':
        rule.until = parseUntil(value)
        break
      case 'WKST':
        rule.wkst = weekdayFromCode(value)
        break
      case 'BYMONTH':
        rule.byMonth = intList(value, key, 1, 12, false)
        break
      case 'BYWEEKNO':
        rule.byWeekNo = intList(value, key, 1, 53, true)
        break
      case 'BYYEARDAY':
        rule.byYearDay = intList(value, key, 1, 366, true)
        break
      case 'BYMONTHDAY':
        rule.byMonthDay = intList(value, key, 1, 31, true)
        break
      case 'BYHOUR':
        rule.byHour = intList(value, key, 0, 23, false)
        break
      case 'BYMINUTE':
        rule.byMinute = intList(value, key, 0, 59, false)
        break
      case 'BYSECOND':
        rule.bySecond = intList(value, key, 0, 59, false)
        break
      case 'BYSETPOS':
        rule.bySetPos = intList(value, key, 1, 366, true)
        break
      case 'BYDAY':
        rule.byDay = value.split(',').map((part) => {
          const m = /^([+-]?\d{1,2})?([A-Z]{2})$/.exec(part)
          if (!m) throw new RRuleError(`Invalid BYDAY value "${part}"`)
          const weekday = weekdayFromCode(m[2]!)
          if (m[1] === undefined) return { weekday }
          const nth = Number(m[1])
          if (nth === 0 || Math.abs(nth) > 53) throw new RRuleError(`Invalid BYDAY value "${part}"`)
          return { weekday, nth }
        })
        break
      default:
        // RFC 5545 allows private extensions.
        if (key.startsWith('X-')) break
        throw new RRuleError(`Unsupported rule part "${key}"`)
    }
  }
  if (rule.count !== undefined && rule.until !== undefined) {
    throw new RRuleError('COUNT and UNTIL cannot both be set')
  }
  if (rule.byWeekNo && freq !== 'YEARLY')
    throw new RRuleError('BYWEEKNO is only valid with FREQ=YEARLY')
  if (rule.byYearDay && ['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) {
    throw new RRuleError(`BYYEARDAY is not valid with FREQ=${freq}`)
  }
  if (rule.byMonthDay && freq === 'WEEKLY')
    throw new RRuleError('BYMONTHDAY is not valid with FREQ=WEEKLY')
  return rule
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function formatUntil(until: ParsedDate): string {
  const date = (d: Temporal.PlainDate) => `${pad(d.year, 4)}${pad(d.month)}${pad(d.day)}`
  const time = (t: Temporal.PlainDateTime) => `T${pad(t.hour)}${pad(t.minute)}${pad(t.second)}`
  switch (until.kind) {
    case 'date':
      return date(until.date)
    case 'floating':
      return date(until.dateTime.toPlainDate()) + time(until.dateTime)
    case 'exact': {
      const utc = until.zdt.withTimeZone('UTC').toPlainDateTime()
      return date(utc.toPlainDate()) + time(utc) + 'Z'
    }
  }
}

/** Serialises a rule to `FREQ=...;...` (without the `RRULE:` prefix). */
export function stringifyRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`]
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`)
  if (rule.until) parts.push(`UNTIL=${formatUntil(rule.until)}`)
  if (rule.wkst !== 1) parts.push(`WKST=${weekdayCode(rule.wkst)}`)
  const list = (name: string, values?: number[]) => {
    if (values?.length) parts.push(`${name}=${values.join(',')}`)
  }
  list('BYMONTH', rule.byMonth)
  list('BYWEEKNO', rule.byWeekNo)
  list('BYYEARDAY', rule.byYearDay)
  list('BYMONTHDAY', rule.byMonthDay)
  if (rule.byDay?.length) {
    parts.push(
      `BYDAY=${rule.byDay.map((d) => `${d.nth ?? ''}${weekdayCode(d.weekday)}`).join(',')}`,
    )
  }
  list('BYHOUR', rule.byHour)
  list('BYMINUTE', rule.byMinute)
  list('BYSECOND', rule.bySecond)
  list('BYSETPOS', rule.bySetPos)
  return parts.join(';')
}
