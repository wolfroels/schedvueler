import { Temporal } from './temporal'
import { parseDateInput, resolveZoned } from './dates'
import type { SchedulerEvent } from './types'

// RFC 5545 import and export for the default event shape. Time zones are read by their IANA name.

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Long lines are folded at 75 octets; a following line that starts with a space continues it. */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter(Boolean)
}

function fold(line: string): string {
  const bytes = new TextEncoder()
  if (bytes.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const width = bytes.encode(char).length
    if (size + width > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += char
    size += width
  }
  parts.push(current)
  return parts.join('\r\n ')
}

interface Property {
  name: string
  params: Record<string, string>
  value: string
}

function parseLine(line: string): Property | null {
  // The value starts after the first colon outside a quoted parameter.
  let quoted = false
  let split = -1
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted
    else if (line[i] === ':' && !quoted) {
      split = i
      break
    }
  }
  if (split < 0) return null
  const [name, ...rest] = line.slice(0, split).split(';')
  const params: Record<string, string> = {}
  for (const part of rest) {
    const eq = part.indexOf('=')
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: name!.toUpperCase(), params, value: line.slice(split + 1) }
}

/** An iCalendar date or date-time as a value the scheduler reads, with its zone in the text. */
function readDate(value: string, params: Record<string, string>): string | undefined {
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  if (date) return `${date[1]}-${date[2]}-${date[3]}`
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value)
  if (!time) return undefined
  const local = `${time[1]}-${time[2]}-${time[3]}T${time[4]}:${time[5]}:${time[6]}`
  if (time[7]) return `${local}Z`
  return params.TZID ? `${local}[${params.TZID}]` : local
}

function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export interface ParseICalResult {
  events: SchedulerEvent[]
  /** What could not be read, such as an unknown time zone. Those events are left out. */
  warnings: string[]
}

/** Reads the events of an iCalendar text, including rules, exdates and edited occurrences. */
export function parseICal(text: string): ParseICalResult {
  const events: SchedulerEvent[] = []
  const warnings: string[] = []
  let current: Property[] | null = null
  let depth = 0 // Components nested in a VEVENT, such as VALARM, are skipped.

  const finish = (props: Property[]) => {
    const get = (name: string) => props.find((p) => p.name === name)
    const uid = get('UID')?.value
    const startProp = get('DTSTART')
    if (!startProp) {
      warnings.push(`Event ${uid ?? '(no UID)'} has no start.`)
      return
    }
    const zone = startProp.params.TZID
    if (zone && !isKnownZone(zone)) {
      warnings.push(`Event ${uid ?? ''} uses the unknown time zone "${zone}".`)
      return
    }
    const start = readDate(startProp.value, startProp.params)
    if (!start) {
      warnings.push(`Event ${uid ?? ''} has an invalid start.`)
      return
    }
    const endProp = get('DTEND')
    let end = endProp && readDate(endProp.value, endProp.params)
    const duration = get('DURATION')?.value
    if (!end && duration) {
      try {
        const span = Temporal.Duration.from(duration)
        const parsed = parseDateInput(start)
        end =
          parsed.kind === 'date'
            ? parsed.date.add(span).toString()
            : resolveZoned(parsed, zone ?? 'UTC')
                .add(span)
                .toString()
      } catch {
        warnings.push(`Event ${uid ?? ''} has an invalid duration.`)
      }
    }

    const dates = (name: string) =>
      props
        .filter((p) => p.name === name)
        .flatMap((p) => p.value.split(',').map((v) => readDate(v, p.params)))
        .filter((v): v is string => !!v)

    const recurrence = get('RECURRENCE-ID')
    const id = recurrence ? `${uid}#${recurrence.value}` : (uid ?? `event-${events.length}`)
    const event: SchedulerEvent = { id, start }
    const summary = get('SUMMARY')?.value
    if (summary !== undefined) event.title = unescapeText(summary)
    if (end) event.end = end
    if (zone) event.timezone = zone
    if (startProp.params.VALUE === 'DATE' || !start.includes('T')) event.allDay = true
    const rrule = get('RRULE')?.value
    if (rrule) event.rrule = rrule
    const exdates = dates('EXDATE')
    if (exdates.length) event.exdates = exdates
    const rdates = dates('RDATE')
    if (rdates.length) event.rdates = rdates
    if (recurrence && uid) {
      event.recurringEventId = uid
      event.recurrenceId = readDate(recurrence.value, recurrence.params)
    }
    events.push(event)
  }

  for (const line of unfold(text)) {
    const prop = parseLine(line)
    if (!prop) continue
    if (prop.name === 'BEGIN') {
      if (prop.value === 'VEVENT' && !current) current = []
      else if (current) depth++
    } else if (prop.name === 'END') {
      if (depth) depth--
      else if (prop.value === 'VEVENT' && current) {
        finish(current)
        current = null
      }
    } else if (current && !depth) current.push(prop)
  }
  return { events, warnings }
}

const compact = (value: string) => value.replace(/[-:]/g, '').replace(/\..*$/, '')

/** A date-time as iCalendar fields: `{ params, value }`. */
function writeDate(value: unknown, zone: string | undefined): { params: string; value: string } {
  const parsed = parseDateInput(value)
  if (parsed.kind === 'date') {
    return { params: ';VALUE=DATE', value: compact(parsed.date.toString()) }
  }
  if (parsed.kind === 'floating') {
    const local = compact(parsed.dateTime.toString({ smallestUnit: 'second' }))
    return zone ? { params: `;TZID=${zone}`, value: local } : { params: '', value: local }
  }
  if (zone) {
    const local = parsed.zdt.withTimeZone(zone).toPlainDateTime()
    return { params: `;TZID=${zone}`, value: compact(local.toString({ smallestUnit: 'second' })) }
  }
  const utc = parsed.zdt.toInstant().toString({ smallestUnit: 'second' })
  return { params: '', value: compact(utc) }
}

function zoneOf(value: unknown): string | undefined {
  const parsed = parseDateInput(value)
  return parsed.kind === 'exact' && parsed.zdt.timeZoneId !== 'UTC'
    ? parsed.zdt.timeZoneId
    : undefined
}

function offsetText(ns: number): string {
  const minutes = Math.round(ns / 60_000_000_000)
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`
}

/** A VTIMEZONE with the offset changes between two years. */
function timeZoneBlock(zone: string, fromYear: number, toYear: number): string[] {
  const lines = ['BEGIN:VTIMEZONE', `TZID:${zone}`]
  let cursor = Temporal.PlainDate.from({ year: fromYear, month: 1, day: 1 }).toZonedDateTime(zone)
  const end = Temporal.PlainDate.from({ year: toYear + 1, month: 1, day: 1 }).toZonedDateTime(zone)
  let any = false
  const observance = (at: Temporal.ZonedDateTime, before: number) => {
    const kind = at.offsetNanoseconds > before ? 'DAYLIGHT' : 'STANDARD'
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${compact(at.toPlainDateTime().toString({ smallestUnit: 'second' }))}`,
      `TZOFFSETFROM:${offsetText(before)}`,
      `TZOFFSETTO:${offsetText(at.offsetNanoseconds)}`,
      `END:${kind}`,
    )
    any = true
  }
  for (;;) {
    const next = cursor.getTimeZoneTransition('next')
    if (!next || Temporal.ZonedDateTime.compare(next, end) >= 0) break
    observance(next, next.subtract({ nanoseconds: 1 }).offsetNanoseconds)
    cursor = next
  }
  if (!any) observance(cursor, cursor.offsetNanoseconds)
  lines.push('END:VTIMEZONE')
  return lines
}

export interface StringifyICalOptions {
  /** PRODID of the calendar. */
  productId?: string
  /** DTSTAMP of the events. Defaults to now. */
  stamp?: Temporal.Instant
}

/** Writes events as an iCalendar text, with VTIMEZONE blocks for the zones they use. */
export function stringifyICal(
  events: readonly SchedulerEvent[],
  options: StringifyICalOptions = {},
): string {
  const stamp = compact(
    (options.stamp ?? Temporal.Now.instant()).toString({ smallestUnit: 'second' }),
  )
  const zones = new Map<string, { from: number; to: number }>()
  const body: string[] = []
  const noteZone = (zone: string | undefined, value: unknown) => {
    if (!zone) return
    const year = resolveZoned(parseDateInput(value), zone).year
    const known = zones.get(zone)
    zones.set(zone, {
      from: Math.min(known?.from ?? year, year),
      to: Math.max(known?.to ?? year, year),
    })
  }

  for (const event of events) {
    const zone = event.timezone ?? zoneOf(event.start)
    const allDay = event.allDay ?? parseDateInput(event.start).kind === 'date'
    const when = (value: unknown) => {
      if (allDay) {
        const parsed = parseDateInput(value)
        const date =
          parsed.kind === 'date' ? parsed.date : resolveZoned(parsed, zone ?? 'UTC').toPlainDate()
        return { params: ';VALUE=DATE', value: compact(date.toString()) }
      }
      return writeDate(value, zone)
    }
    const start = when(event.start)
    if (!allDay) noteZone(zone, event.start)
    const uid = event.recurringEventId != null ? event.recurringEventId : event.id
    body.push('BEGIN:VEVENT', `UID:${escapeText(String(uid))}`, `DTSTAMP:${stamp}`)
    body.push(`DTSTART${start.params}:${start.value}`)
    if (event.end != null) {
      const end = when(event.end)
      body.push(`DTEND${end.params}:${end.value}`)
    }
    if (event.title !== undefined) body.push(`SUMMARY:${escapeText(event.title)}`)
    if (event.rrule) body.push(`RRULE:${event.rrule.replace(/^RRULE:/i, '')}`)
    for (const value of event.exdates ?? []) {
      const date = when(value)
      body.push(`EXDATE${date.params}:${date.value}`)
    }
    for (const value of event.rdates ?? []) {
      const date = when(value)
      body.push(`RDATE${date.params}:${date.value}`)
    }
    if (event.recurrenceId != null) {
      const id = when(event.recurrenceId)
      body.push(`RECURRENCE-ID${id.params}:${id.value}`)
    }
    body.push('END:VEVENT')
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${options.productId ?? '-//orb-scheduler//EN'}`,
    'CALSCALE:GREGORIAN',
    ...[...zones].flatMap(([zone, years]) => timeZoneBlock(zone, years.from, years.to)),
    ...body,
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
