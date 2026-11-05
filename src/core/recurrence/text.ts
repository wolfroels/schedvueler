import { Temporal } from '../temporal'
import { parseDateInput, resolveZoned } from '../dates'
import { formatDate } from '../format'
import { parseRRule, stringifyRRule, type Frequency, type RecurrenceRule } from './rule'

/** The words of a recurrence description. See `recurrenceTextEn` for what each one looks like. */
export interface RecurrenceTextStrings {
  every: (freq: Frequency, interval: number) => string
  /** "on Monday and Friday". */
  onDays: (list: string) => string
  /** "on the 15th". */
  onMonthDay: (list: string) => string
  /** "on the first Monday". */
  onNth: (nth: number, weekday: string) => string
  /** "in March". */
  inMonths: (list: string) => string
  times: (count: number) => string
  until: (date: string) => string
  and: string
}

const EN_UNITS: Record<Frequency, [string, string]> = {
  YEARLY: ['year', 'years'],
  MONTHLY: ['month', 'months'],
  WEEKLY: ['week', 'weeks'],
  DAILY: ['day', 'days'],
  HOURLY: ['hour', 'hours'],
  MINUTELY: ['minute', 'minutes'],
}
const EN_NTH: Record<string, string> = {
  '1': 'first',
  '2': 'second',
  '3': 'third',
  '4': 'fourth',
  '5': 'fifth',
  '-1': 'last',
  '-2': 'second last',
}

export const recurrenceTextEn: RecurrenceTextStrings = {
  every: (freq, interval) =>
    interval === 1 ? `Every ${EN_UNITS[freq][0]}` : `Every ${interval} ${EN_UNITS[freq][1]}`,
  onDays: (list) => `on ${list}`,
  onMonthDay: (list) => `on day ${list}`,
  onNth: (nth, weekday) => `on the ${EN_NTH[nth] ?? `${nth}th`} ${weekday}`,
  inMonths: (list) => `in ${list}`,
  times: (count) => (count === 1 ? 'once' : `${count} times`),
  until: (date) => `until ${date}`,
  and: 'and',
}

function join(items: readonly string[], and: string): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}

const WEEKDAY_BASE = Temporal.PlainDate.from('2024-01-01') // A Monday.

export interface RecurrenceTextOptions {
  /** Used for the names of weekdays, months and dates. */
  locale?: string
  /** The words. Default English; `schedvueler/locales` has more. */
  strings?: RecurrenceTextStrings
  /** Zone to show `UNTIL` in. Default UTC. */
  timeZone?: string
}

/** A rule in words: "Every 2 weeks on Monday and Friday, until 5 March 2027". */
export function recurrenceToText(
  rule: RecurrenceRule | string,
  options: RecurrenceTextOptions = {},
): string {
  const r = typeof rule === 'string' ? parseRRule(rule) : rule
  const s = options.strings ?? recurrenceTextEn
  const { locale } = options
  const weekday = (iso: number) =>
    formatDate(WEEKDAY_BASE.add({ days: iso - 1 }), locale, { weekday: 'long' })
  const month = (m: number) =>
    formatDate(Temporal.PlainDate.from({ year: 2024, month: m, day: 1 }), locale, { month: 'long' })

  const parts = [s.every(r.freq, r.interval)]
  const nth = r.byDay?.filter((d) => d.nth !== undefined) ?? []
  const plain = r.byDay?.filter((d) => d.nth === undefined) ?? []
  if (plain.length)
    parts.push(
      s.onDays(
        join(
          plain.map((d) => weekday(d.weekday)),
          s.and,
        ),
      ),
    )
  for (const d of nth) parts.push(s.onNth(d.nth!, weekday(d.weekday)))
  // BYSETPOS with weekdays means "the nth of these".
  if (plain.length === 1 && r.bySetPos?.length === 1) {
    parts.splice(1, 1, s.onNth(r.bySetPos[0]!, weekday(plain[0]!.weekday)))
  }
  if (r.byMonthDay?.length) parts.push(s.onMonthDay(join(r.byMonthDay.map(String), s.and)))
  if (r.byMonth?.length) parts.push(s.inMonths(join(r.byMonth.map(month), s.and)))

  let text = parts.join(' ')
  if (r.count !== undefined) text += `, ${s.times(r.count)}`
  if (r.until) {
    const date = resolveZoned(r.until, options.timeZone ?? 'UTC').toPlainDate()
    const shown = formatDate(date, locale, { day: 'numeric', month: 'long', year: 'numeric' })
    text += `, ${s.until(shown)}`
  }
  return text
}

/** A recurrence as the fields of a form. */
export interface RecurrenceForm {
  freq: Frequency
  interval: number
  /** ISO weekdays, for weekly rules. */
  weekdays: number[]
  /** For monthly rules: on a day of the month, or on a weekday such as the second Tuesday. */
  monthlyMode: 'day' | 'weekday'
  monthDay: number
  /** 1 to 5, or -1 for the last. */
  nth: number
  /** ISO weekday, with `monthlyMode: 'weekday'`. */
  nthWeekday: number
  endType: 'never' | 'count' | 'until'
  count: number
  /** "YYYY-MM-DD". */
  until: string
}

export function defaultRecurrenceForm(start: Temporal.PlainDate): RecurrenceForm {
  return {
    freq: 'WEEKLY',
    interval: 1,
    weekdays: [start.dayOfWeek],
    monthlyMode: 'day',
    monthDay: start.day,
    nth: Math.ceil(start.day / 7),
    nthWeekday: start.dayOfWeek,
    endType: 'never',
    count: 10,
    until: start.add({ months: 3 }).toString(),
  }
}

/** Reads a rule into form fields. Parts the form cannot show are kept out of it. */
export function recurrenceToForm(
  rule: RecurrenceRule | string,
  start: Temporal.PlainDate,
): RecurrenceForm {
  const r = typeof rule === 'string' ? parseRRule(rule) : rule
  const form = defaultRecurrenceForm(start)
  form.freq = r.freq
  form.interval = r.interval
  if (r.freq === 'WEEKLY' && r.byDay?.length) form.weekdays = r.byDay.map((d) => d.weekday)
  if (r.freq === 'MONTHLY') {
    const day = r.byDay?.[0]
    const nth = day?.nth ?? r.bySetPos?.[0]
    if (day && nth !== undefined) {
      form.monthlyMode = 'weekday'
      form.nth = nth
      form.nthWeekday = day.weekday
    } else if (r.byMonthDay?.[0] !== undefined) form.monthDay = r.byMonthDay[0]
  }
  if (r.count !== undefined) {
    form.endType = 'count'
    form.count = r.count
  } else if (r.until) {
    form.endType = 'until'
    form.until = resolveZoned(r.until, 'UTC').toPlainDate().toString()
  }
  return form
}

/** Writes form fields as a rule text, such as `FREQ=WEEKLY;BYDAY=MO,FR;COUNT=10`. */
export function formToRecurrence(form: RecurrenceForm): string {
  const rule: RecurrenceRule = {
    freq: form.freq,
    interval: Math.max(1, Math.floor(form.interval) || 1),
    wkst: 1,
  }
  if (form.freq === 'WEEKLY' && form.weekdays.length) {
    rule.byDay = [...form.weekdays].sort((a, b) => a - b).map((weekday) => ({ weekday }))
  }
  if (form.freq === 'MONTHLY') {
    if (form.monthlyMode === 'weekday') {
      rule.byDay = [{ weekday: form.nthWeekday, nth: form.nth }]
    } else rule.byMonthDay = [form.monthDay]
  }
  if (form.endType === 'count') rule.count = Math.max(1, Math.floor(form.count) || 1)
  if (form.endType === 'until') rule.until = parseDateInput(form.until)
  return stringifyRRule(rule)
}
