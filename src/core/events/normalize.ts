import type { Temporal } from '../temporal'
import { resolveZoned, type ParsedDate } from '../dates'
import type { DateAdapter } from '../date-adapter'
import { parseRRule, type RecurrenceSeries } from '../recurrence'
import type { EventAccessors, EventId, EventOccurrence, ResourceId } from '../types'

export interface NormalizeContext<T> {
  accessors: EventAccessors<T>
  adapter: Pick<DateAdapter<unknown>, 'parse'>
  /** Display zone. */
  timeZone: string
  /** Zone for events without their own `timezone`. */
  eventTimeZone: string
  defaultTimedDurationMs: number
  defaultAllDayDays: number
}

interface BaseRecord<T> {
  key: string
  id: EventId
  event: T
  allDay: boolean
  resourceIds: readonly ResourceId[]
}

/** A non-recurring event, already placed in the display zone. */
export interface SingleRecord<T> extends BaseRecord<T> {
  kind: 'single'
  occurrence: EventOccurrence<T>
  /** Set when this event replaces one occurrence of a series. */
  exceptionOf?: { seriesKey: string; recurrenceKey: string }
}

export interface SeriesRecord<T> extends BaseRecord<T> {
  kind: 'series'
  series: RecurrenceSeries
  durationMs: number
  durationDays: number
}

export type EventRecord<T> = SingleRecord<T> | SeriesRecord<T>

export function eventKey(id: EventId): string {
  return String(id)
}

/** Key that matches a generated occurrence with the exception that replaces it. */
export function recurrenceKey(value: Temporal.ZonedDateTime | Temporal.PlainDate): string {
  return 'epochMilliseconds' in value ? `ms:${value.epochMilliseconds}` : `d:${value.toString()}`
}

function parsedRecurrenceKey(parsed: ParsedDate, timeZone: string): string {
  if (parsed.kind === 'date') return `d:${parsed.date.toString()}`
  return `ms:${resolveZoned(parsed, timeZone).epochMilliseconds}`
}

function toPlain(
  parsed: ParsedDate,
  timeZone: string,
): Temporal.PlainDate | Temporal.PlainDateTime {
  switch (parsed.kind) {
    case 'date':
      return parsed.date
    case 'floating':
      return parsed.dateTime
    case 'exact':
      return parsed.zdt.withTimeZone(timeZone).toPlainDateTime()
  }
}

/** Reads one user event into an internal record. Throws on invalid data. */
export function normalizeEvent<T>(event: T, ctx: NormalizeContext<T>): EventRecord<T> {
  const { accessors: a, adapter, timeZone } = ctx
  const id = a.id(event)
  const key = eventKey(id)
  const eventZone = a.timezone(event) ?? ctx.eventTimeZone
  const startParsed = adapter.parse(a.start(event))
  const endValue = a.end(event)
  const endParsed = endValue == null ? undefined : adapter.parse(endValue)
  const allDay = a.allDay(event) ?? startParsed.kind === 'date'
  const resourceIds = a.resourceIds(event)

  // Resolve start and end in the event's own zone; all-day events are calendar dates.
  let startDate: Temporal.PlainDate | undefined
  let endDate: Temporal.PlainDate | undefined
  let start: Temporal.ZonedDateTime | undefined
  let end: Temporal.ZonedDateTime | undefined
  if (allDay) {
    startDate = resolveZoned(startParsed, eventZone).toPlainDate()
    endDate = endParsed ? resolveZoned(endParsed, eventZone).toPlainDate() : undefined
    if (!endDate || endDate.until(startDate).sign >= 0)
      endDate = startDate.add({ days: ctx.defaultAllDayDays })
  } else {
    start = resolveZoned(startParsed, eventZone)
    end = endParsed ? resolveZoned(endParsed, eventZone) : undefined
    if (!end || end.epochMilliseconds < start.epochMilliseconds) {
      end = start.add({ milliseconds: ctx.defaultTimedDurationMs })
    }
  }

  const rruleText = a.rrule(event)
  if (rruleText) {
    const rule = parseRRule(rruleText)
    const parseList = (values: readonly unknown[] | undefined) =>
      values?.map((v) => adapter.parse(v))
    return {
      kind: 'series',
      key,
      id,
      event,
      allDay,
      resourceIds,
      series: {
        rule,
        start: allDay ? startDate! : toPlain(startParsed, eventZone),
        timeZone: eventZone,
        exdates: parseList(a.exdates(event)),
        rdates: parseList(a.rdates(event)),
      },
      durationMs: allDay ? 0 : end!.epochMilliseconds - start!.epochMilliseconds,
      durationDays: allDay ? startDate!.until(endDate!).days : 0,
    }
  }

  const displayStart = allDay
    ? startDate!.toZonedDateTime({ timeZone })
    : start!.withTimeZone(timeZone)
  const displayEnd = allDay ? endDate!.toZonedDateTime({ timeZone }) : end!.withTimeZone(timeZone)

  const seriesId = a.recurringEventId(event)
  const recurrenceIdValue = seriesId != null ? a.recurrenceId(event) : undefined
  const recurrenceParsed = recurrenceIdValue != null ? adapter.parse(recurrenceIdValue) : undefined

  const occurrence: EventOccurrence<T> = Object.freeze({
    key,
    id,
    event,
    start: displayStart,
    end: displayEnd,
    startMs: displayStart.epochMilliseconds,
    endMs: displayEnd.epochMilliseconds,
    allDay,
    resourceIds,
    recurring: false,
    isException: recurrenceParsed !== undefined,
    recurrenceId: recurrenceParsed
      ? recurrenceParsed.kind === 'date'
        ? recurrenceParsed.date
        : resolveZoned(recurrenceParsed, eventZone)
      : undefined,
    seriesId: recurrenceParsed ? seriesId : undefined,
  })

  return {
    kind: 'single',
    key,
    id,
    event,
    allDay,
    resourceIds,
    occurrence,
    exceptionOf:
      recurrenceParsed && seriesId != null
        ? {
            seriesKey: eventKey(seriesId),
            recurrenceKey: parsedRecurrenceKey(recurrenceParsed, eventZone),
          }
        : undefined,
  }
}
