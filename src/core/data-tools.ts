import { formatDate } from './format'
import { Temporal } from './temporal'
import type { EventId, EventOccurrence } from './types'

export interface CsvColumn<T> {
  header: string
  value: (occurrence: EventOccurrence<T>) => unknown
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value)
  // Spreadsheets run cells that start like a formula; this keeps them as text.
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text)) text = `'${text}`
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function defaultCsvColumns<T>(title: (event: T) => string | undefined): CsvColumn<T>[] {
  return [
    { header: 'Title', value: (o) => title(o.event) },
    {
      header: 'Start',
      value: (o) => (o.allDay ? o.start.toPlainDate() : o.start.toPlainDateTime()),
    },
    {
      header: 'End',
      value: (o) =>
        o.allDay ? o.end.subtract({ days: 1 }).toPlainDate() : o.end.toPlainDateTime(),
    },
    { header: 'All day', value: (o) => o.allDay },
    { header: 'Resources', value: (o) => o.resourceIds.join(' ') },
  ]
}

/** Occurrences as CSV. All-day ends are the last day here, as spreadsheet users expect. */
export function occurrencesToCsv<T>(
  occurrences: readonly EventOccurrence<T>[],
  columns: readonly CsvColumn<T>[],
): string {
  const rows = [
    columns.map((c) => csvCell(c.header)).join(','),
    ...occurrences.map((o) => columns.map((c) => csvCell(c.value(o))).join(',')),
  ]
  return rows.join('\r\n') + '\r\n'
}

/** Occurrences as JSON, with times as ISO text. */
export function occurrencesToJson<T>(occurrences: readonly EventOccurrence<T>[]): string {
  return JSON.stringify(
    occurrences.map((o) => ({
      id: o.id,
      key: o.key,
      start: o.allDay ? o.start.toPlainDate().toString() : o.start.toString(),
      end: o.allDay ? o.end.toPlainDate().toString() : o.end.toString(),
      allDay: o.allDay,
      resourceIds: o.resourceIds,
      event: o.event,
    })),
    null,
    2,
  )
}

export interface EventChanges<T> {
  created: T[]
  updated: { before: T; after: T }[]
  deleted: T[]
}

/**
 * What changed between two lists of events. Events are compared by identity first and then by
 * their fields, so that saving only touches what really differs.
 */
export function diffEvents<T>(
  before: readonly T[],
  after: readonly T[],
  id: (event: T) => EventId = (e) => (e as { id: EventId }).id,
): EventChanges<T> {
  const old = new Map(before.map((e) => [String(id(e)), e]))
  const changes: EventChanges<T> = { created: [], updated: [], deleted: [] }
  const seen = new Set<string>()
  for (const event of after) {
    const key = String(id(event))
    seen.add(key)
    const previous = old.get(key)
    if (previous === undefined) changes.created.push(event)
    else if (previous !== event && JSON.stringify(previous) !== JSON.stringify(event))
      changes.updated.push({ before: previous, after: event })
  }
  for (const [key, event] of old) if (!seen.has(key)) changes.deleted.push(event)
  return changes
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Red, green and blue of `#rgb` or `#rrggbb`. */
export function parseHexColor(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio of two hex colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const x = parseHexColor(a)
  const y = parseHexColor(b)
  if (!x || !y) return 1
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Black or white, whichever reads better on a hex color. */
export function readableTextColor(background: string): '#000000' | '#ffffff' {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff')
    ? '#000000'
    : '#ffffff'
}

/** CSS variables for a whole theme from one hex color. Set them on the scheduler. */
export function createTheme(
  color: string,
  mode: 'light' | 'dark' = 'light',
): Record<string, string> {
  const dark = mode === 'dark'
  return {
    '--orb-color-accent': color,
    '--orb-color-accent-contrast': readableTextColor(color),
    '--orb-color-bg': `color-mix(in srgb, ${color} 3%, ${dark ? '#0b1120' : '#ffffff'})`,
    '--orb-color-surface': `color-mix(in srgb, ${color} 6%, ${dark ? '#111827' : '#ffffff'})`,
    '--orb-color-border': `color-mix(in srgb, ${color} 14%, ${dark ? '#1f2937' : '#e2e8f0'})`,
    '--orb-color-border-subtle': `color-mix(in srgb, ${color} 7%, ${dark ? '#172033' : '#f1f5f9'})`,
    '--orb-color-text': dark ? '#e2e8f0' : '#0f172a',
    '--orb-color-text-muted': dark ? '#94a3b8' : '#55637a',
  }
}

export interface QuickAddResult {
  title: string
  start: Temporal.PlainDateTime | Temporal.PlainDate
  /** Minutes; missing when no length was given. */
  durationMinutes?: number
}

export interface QuickAddOptions {
  /** The date that "today" means. */
  today: Temporal.PlainDate
  /** For weekday names. Default English. */
  locale?: string
}

const CLOCK = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s+)?(\d{1,2}):(\d{2})\b/i
const LENGTH = /\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/

/**
 * Reads text such as "Lunch friday 12:30 for 1h". Understands today, tomorrow, weekday names,
 * ISO dates, 24-hour and am/pm times, and lengths. Pass your own function to `<SchedulerQuickAdd>`
 * to understand more.
 */
export function parseQuickAdd(input: string, options: QuickAddOptions): QuickAddResult {
  let text = ` ${input.trim()} `
  let date = options.today
  let durationMinutes: number | undefined

  const length = LENGTH.exec(text)
  if (length) {
    const value = Number(length[1])
    durationMinutes = Math.round(/^h/i.test(length[2]!) ? value * 60 : value)
    text = text.replace(length[0], ' ')
  }

  let minute: number | undefined
  const clock = CLOCK.exec(text)
  if (clock) {
    const pm = clock[3]?.toLowerCase()
    let hour = Number(clock[1] ?? clock[4])
    const min = Number(clock[2] ?? clock[5] ?? 0)
    if (pm === 'pm' && hour < 12) hour += 12
    if (pm === 'am' && hour === 12) hour = 0
    if (hour < 24 && min < 60) {
      minute = hour * 60 + min
      text = text.replace(clock[0], ' ')
    }
  }

  const iso = ISO_DATE.exec(text)
  if (iso) {
    date = Temporal.PlainDate.from(iso[1]!)
    text = text.replace(iso[0], ' ')
  } else if (/\btomorrow\b/i.test(text)) {
    date = options.today.add({ days: 1 })
    text = text.replace(/\btomorrow\b/i, ' ')
  } else if (/\btoday\b/i.test(text)) {
    text = text.replace(/\btoday\b/i, ' ')
  } else {
    // Weekday names of the locale, and English ones.
    for (let i = 0; i < 7; i++) {
      const day = Temporal.PlainDate.from('2024-01-01').add({ days: i })
      const names = new Set(
        [
          formatDate(day, options.locale, { weekday: 'long' }),
          formatDate(day, options.locale, { weekday: 'short' }),
          formatDate(day, 'en', { weekday: 'long' }),
          formatDate(day, 'en', { weekday: 'short' }),
        ].map((n) => n.toLowerCase().replace(/\.$/, '')),
      )
      const found = [...names].find((n) => new RegExp(`(^|\\s)${n}(\\s|$)`, 'i').test(text))
      if (!found) continue
      const ahead = (i + 1 - options.today.dayOfWeek + 7) % 7
      date = options.today.add({ days: ahead })
      text = text.replace(new RegExp(`(^|\\s)${found}(\\s|$)`, 'i'), ' ')
      break
    }
  }

  const title = text.replace(/\s+/g, ' ').trim()
  return {
    title,
    start:
      minute === undefined
        ? date
        : date.toPlainDateTime({ hour: Math.floor(minute / 60), minute: minute % 60 }),
    durationMinutes,
  }
}
