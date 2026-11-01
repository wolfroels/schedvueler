import { Temporal } from './temporal'
import { daysBetween, parseDateInput, resolveZoned } from './dates'
import type { EventTimes } from './interaction'
import {
  formatRecurrenceId,
  parseRRule,
  stringifyRRule,
  truncateRuleBefore,
  countOccurrencesBefore,
  type RecurrenceEditScope,
  type RecurrenceRule,
  type RecurrenceSeries,
} from './recurrence'
import { sameResourceIds } from './resources'
import type { EventId, EventOccurrence, SchedulerEvent } from './types'

// Helpers that apply scheduler changes to arrays of the default `SchedulerEvent` shape and return
// a new array (unchanged events keep their identity). Apps with their own event shape can follow
// the same logic with their own fields.

export interface EditOptions {
  /** Which occurrences of a recurring event the change applies to. Default "this". */
  scope?: RecurrenceEditScope
  /** Zone for event times without offset and without their own `timezone`. */
  timeZone: string
  /** Id for events created by the edit (exceptions, split-off series). */
  createId?: (from: SchedulerEvent) => EventId
}

let idCounter = 0
const defaultCreateId = (from: SchedulerEvent): EventId =>
  `${from.id}~${Date.now().toString(36)}${(idCounter++).toString(36)}`

function formatTimes(
  times: EventTimes,
  timeZone: string,
): Pick<SchedulerEvent, 'start' | 'end' | 'allDay'> {
  if (times.allDay) {
    return {
      start: times.start.toPlainDate().toString(),
      end: times.end.toPlainDate().toString(),
      allDay: true,
    }
  }
  return {
    start: times.start.withTimeZone(timeZone).toString(),
    end: times.end.withTimeZone(timeZone).toString(),
    allDay: false,
  }
}

/** Like `formatTimes`, as wall-clock times, for events that follow the zone they are shown in. */
function wallClockTimes(
  times: EventTimes,
  timeZone: string,
): Pick<SchedulerEvent, 'start' | 'end' | 'allDay'> {
  if (times.allDay) return formatTimes(times, timeZone)
  return {
    start: times.start.withTimeZone(timeZone).toPlainDateTime().toString(),
    end: times.end.withTimeZone(timeZone).toPlainDateTime().toString(),
    allDay: false,
  }
}

/** The event with the resources from `times`, when the change moved it to other resources. */
function withResources(
  event: SchedulerEvent,
  occurrence: EventOccurrence<SchedulerEvent>,
  times: EventTimes,
): SchedulerEvent {
  const ids = times.resourceIds
  if (!ids || sameResourceIds(ids, occurrence.resourceIds)) return event
  const { resourceId: _id, resourceIds: _ids, ...rest } = event
  return ids.length === 1 ? { ...rest, resourceId: ids[0] } : { ...rest, resourceIds: [...ids] }
}

/**
 * How an occurrence is stored in `recurrenceId` and `exdates`. A series without its own zone keeps
 * its wall-clock time when the zone changes, so its occurrences are stored as wall-clock times too.
 */
function storedRecurrenceId(
  series: SchedulerEvent,
  value: Temporal.ZonedDateTime | Temporal.PlainDate,
): string {
  return series.timezone == null && 'timeZoneId' in value
    ? value.toPlainDateTime().toString()
    : formatRecurrenceId(value)
}

function seriesOf(event: SchedulerEvent, timeZone: string): RecurrenceSeries {
  const zone = event.timezone ?? timeZone
  const parsed = parseDateInput(event.start)
  const allDay = event.allDay ?? parsed.kind === 'date'
  const zoned = resolveZoned(parsed, zone)
  return {
    rule: parseRRule(event.rrule!),
    start: allDay ? zoned.toPlainDate() : zoned.toPlainDateTime(),
    timeZone: zone,
  }
}

function shiftWeekdays(rule: RecurrenceRule, days: number): RecurrenceRule {
  if (!days || !rule.byDay) return rule
  return {
    ...rule,
    byDay: rule.byDay.map((d) => ({ ...d, weekday: ((((d.weekday - 1 + days) % 7) + 7) % 7) + 1 })),
  }
}

/** Start/end fields for a series whose first occurrence moves along with `occurrence`. */
function movedSeriesTimes(
  seriesStart: Temporal.PlainDate | Temporal.PlainDateTime,
  zone: string,
  occurrence: EventOccurrence<SchedulerEvent>,
  times: EventTimes,
): { fields: Pick<SchedulerEvent, 'start' | 'end' | 'allDay'>; dayShift: number } {
  const oldDate = occurrence.start.withTimeZone(zone).toPlainDate()
  const newStartLocal = times.start.withTimeZone(zone)
  const dayShift = daysBetween(oldDate, newStartLocal.toPlainDate())
  const firstDate = ('hour' in seriesStart ? seriesStart.toPlainDate() : seriesStart).add({
    days: dayShift,
  })
  if (times.allDay) {
    const span = Math.max(1, daysBetween(times.start.toPlainDate(), times.end.toPlainDate()))
    return {
      fields: {
        start: firstDate.toString(),
        end: firstDate.add({ days: span }).toString(),
        allDay: true,
      },
      dayShift,
    }
  }
  // Wall-clock fields, so the series keeps its local time across DST.
  const start = firstDate.toPlainDateTime(newStartLocal.toPlainTime())
  const durationMinutes = (times.end.epochMilliseconds - times.start.epochMilliseconds) / 60_000
  return {
    fields: {
      start: start.toString({ smallestUnit: 'minute' }),
      end: start.add({ minutes: durationMinutes }).toString({ smallestUnit: 'minute' }),
      allDay: false,
    },
    dayShift,
  }
}

/**
 * Removes exception events of a series, all of them or only those replacing occurrences at or
 * after `from`. Used when a series edit makes their recurrence ids meaningless.
 */
function dropExceptions(
  events: readonly SchedulerEvent[],
  seriesId: EventId,
  from: Temporal.ZonedDateTime | Temporal.PlainDate | undefined,
  timeZone: string,
): SchedulerEvent[] {
  const fromMs =
    from === undefined
      ? -Infinity
      : 'epochMilliseconds' in from
        ? from.epochMilliseconds
        : from.toZonedDateTime({ timeZone }).epochMilliseconds
  return events.filter((e) => {
    if (e.recurringEventId !== seriesId || e.recurrenceId == null) return true
    const id = resolveZoned(parseDateInput(e.recurrenceId), e.timezone ?? timeZone)
    return id.epochMilliseconds < fromMs
  })
}

function replace(events: readonly SchedulerEvent[], id: EventId, next: SchedulerEvent | null) {
  const out: SchedulerEvent[] = []
  for (const e of events) {
    if (e.id !== id) out.push(e)
    else if (next) out.push(next)
  }
  return out
}

/**
 * Applies new times to the event behind `occurrence`.
 *
 * When `times.resourceIds` differs from the occurrence's, the edited event gets those resources.
 *
 * For recurring events:
 * - "this" adds an exception event that replaces the occurrence
 * - "following" ends the series before the occurrence and starts a new series from the new time
 * - "all" moves the whole series by the same wall-clock shift (weekday rules move along)
 *
 * An already edited occurrence follows the same rules: "this" changes the exception, the others
 * change its series.
 *
 * Series edits drop the exception events they invalidate: all of them for "all", the later ones
 * for "following". Exdates and rdates move along with the series (or go to the split-off series
 * when they are after the split); they are dropped when an edit switches between all-day and timed.
 */
export function applyEventEdit(
  events: readonly SchedulerEvent[],
  occurrence: EventOccurrence<SchedulerEvent>,
  times: EventTimes,
  options: EditOptions,
): SchedulerEvent[] {
  const scope = options.scope ?? 'this'
  const createId = options.createId ?? defaultCreateId
  const event = occurrence.event
  const zone = event.timezone ?? options.timeZone

  // A series-wide change to an edited occurrence is a change to the series at that occurrence.
  if (occurrence.isException && occurrence.recurrenceId && scope !== 'this') {
    const parent = events.find((e) => e.id === occurrence.seriesId)
    if (parent) {
      const id = occurrence.recurrenceId
      const parentZone = parent.timezone ?? options.timeZone
      return applyEventEdit(
        events,
        {
          ...occurrence,
          event: parent,
          recurring: true,
          isException: false,
          start: 'timeZoneId' in id ? id : id.toZonedDateTime({ timeZone: parentZone }),
        },
        times,
        options,
      )
    }
  }

  if (!occurrence.recurring || !occurrence.recurrenceId) {
    const floating = event.timezone == null && parseDateInput(event.start).kind === 'floating'
    const fields = floating ? wallClockTimes(times, zone) : formatTimes(times, zone)
    return replace(events, event.id, withResources({ ...event, ...fields }, occurrence, times))
  }

  const series = event
  if (scope === 'this') {
    const { rrule: _rrule, exdates: _ex, rdates: _rd, ...base } = series
    const exception: SchedulerEvent = {
      ...base,
      ...(series.timezone == null ? wallClockTimes(times, zone) : formatTimes(times, zone)),
      id: createId(series),
      recurringEventId: series.id,
      recurrenceId: storedRecurrenceId(series, occurrence.recurrenceId),
    }
    return [...events, withResources(exception, occurrence, times)]
  }

  const info = seriesOf(series, options.timeZone)
  const truncated = scope === 'following' ? truncateRuleBefore(info, occurrence.recurrenceId) : null

  if (!truncated) {
    // "all", or "following" from the first occurrence.
    const { fields, dayShift } = movedSeriesTimes(info.start, info.timeZone, occurrence, times)
    const rest = dropExceptions(events, series.id, undefined, options.timeZone)
    const original = recurrencePlain(occurrence.recurrenceId)
    const moved = movedLocal(times, info.timeZone)
    const updated: SchedulerEvent = {
      ...series,
      ...fields,
      rrule: stringifyRRule(shiftWeekdays(info.rule, dayShift)),
      exdates: shiftDates(series.exdates, info.timeZone, original, moved),
      rdates: shiftDates(series.rdates, info.timeZone, original, moved),
    }
    return replace(rest, series.id, withResources(updated, occurrence, times))
  }

  const before = countOccurrencesBefore(info, recurrencePlain(occurrence.recurrenceId))
  const { fields, dayShift } = movedSeriesTimes(
    recurrencePlain(occurrence.recurrenceId),
    info.timeZone,
    occurrence,
    times,
  )
  let rule = shiftWeekdays(info.rule, dayShift)
  if (rule.count !== undefined) rule = { ...rule, count: Math.max(1, rule.count - before) }
  const { exdates: _ex, rdates: _rd, ...base } = series
  const original = recurrencePlain(occurrence.recurrenceId)
  const moved = movedLocal(times, info.timeZone)
  const next: SchedulerEvent = {
    ...base,
    ...fields,
    id: createId(series),
    rrule: stringifyRRule(rule),
    exdates: shiftDates(series.exdates, info.timeZone, original, moved, original),
    rdates: shiftDates(series.rdates, info.timeZone, original, moved, original),
  }
  const ended: SchedulerEvent = { ...series, rrule: stringifyRRule(truncated) }
  const rest = dropExceptions(events, series.id, occurrence.recurrenceId, options.timeZone)
  return [...replace(rest, series.id, ended), withResources(next, occurrence, times)]
}

/**
 * Moves exdates/rdates along with a series edit, by the same wall-clock shift as the occurrence.
 * With `from`, only dates at or after it are kept (they belong to the split-off series).
 * Returns `undefined` when the edit switches between all-day and timed, where dates cannot map.
 */
function shiftDates(
  values: readonly unknown[] | undefined,
  zone: string,
  original: Temporal.PlainDate | Temporal.PlainDateTime,
  moved: Temporal.PlainDate | Temporal.PlainDateTime,
  from?: Temporal.PlainDate | Temporal.PlainDateTime,
): string[] | undefined {
  if (!values?.length || 'hour' in original !== 'hour' in moved) return undefined
  const timed = 'hour' in original
  const minutes = timed
    ? (original as Temporal.PlainDateTime).until(moved as Temporal.PlainDateTime, {
        largestUnit: 'minutes',
      }).minutes
    : 0
  const days = daysBetween(
    timed ? (original as Temporal.PlainDateTime).toPlainDate() : (original as Temporal.PlainDate),
    timed ? (moved as Temporal.PlainDateTime).toPlainDate() : (moved as Temporal.PlainDate),
  )
  const fromKey = from && (timed ? (from as Temporal.PlainDateTime).toString() : from.toString())
  const out: string[] = []
  for (const value of values) {
    const parsed = parseDateInput(value)
    if (parsed.kind === 'date' || !timed) {
      const date = parsed.kind === 'date' ? parsed.date : resolveZoned(parsed, zone).toPlainDate()
      if (fromKey && date.toString() < fromKey.slice(0, 10)) continue
      out.push(date.add({ days }).toString())
    } else {
      const local = resolveZoned(parsed, zone).toPlainDateTime()
      if (fromKey && Temporal.PlainDateTime.compare(local, from as Temporal.PlainDateTime) < 0)
        continue
      out.push(local.add({ minutes }).toString({ smallestUnit: 'minute' }))
    }
  }
  return out.length ? out : undefined
}

function movedLocal(times: EventTimes, zone: string): Temporal.PlainDate | Temporal.PlainDateTime {
  const start = times.start.withTimeZone(zone)
  return times.allDay ? start.toPlainDate() : start.toPlainDateTime()
}

function recurrencePlain(
  value: Temporal.ZonedDateTime | Temporal.PlainDate,
): Temporal.PlainDate | Temporal.PlainDateTime {
  return 'timeZoneId' in value ? value.toPlainDateTime() : value
}

/**
 * Removes the event behind `occurrence`. For recurring events "this" adds an exdate, "following"
 * ends the series before the occurrence, and "all" removes the series and its exceptions.
 */
export function removeEventOccurrence(
  events: readonly SchedulerEvent[],
  occurrence: EventOccurrence<SchedulerEvent>,
  options: EditOptions,
): SchedulerEvent[] {
  const scope = options.scope ?? 'this'
  const event = occurrence.event

  // An edited occurrence: remove it and keep the generated one from coming back.
  if (occurrence.isException && occurrence.seriesId != null && occurrence.recurrenceId) {
    const without = replace(events, event.id, null)
    if (scope === 'this') {
      const id = occurrence.recurrenceId
      return without.map((e) =>
        e.id === occurrence.seriesId
          ? { ...e, exdates: [...(e.exdates ?? []), storedRecurrenceId(e, id)] }
          : e,
      )
    }
    const series = events.find((e) => e.id === occurrence.seriesId)
    if (!series) return without
    return removeSeriesFrom(without, series, occurrence.recurrenceId, scope, options.timeZone)
  }

  if (!occurrence.recurring || !occurrence.recurrenceId) return replace(events, event.id, null)

  if (scope === 'this') {
    const id = storedRecurrenceId(event, occurrence.recurrenceId)
    return replace(events, event.id, { ...event, exdates: [...(event.exdates ?? []), id] })
  }
  return removeSeriesFrom(events, event, occurrence.recurrenceId, scope, options.timeZone)
}

function removeSeriesFrom(
  events: readonly SchedulerEvent[],
  series: SchedulerEvent,
  from: Temporal.ZonedDateTime | Temporal.PlainDate,
  scope: 'following' | 'all',
  timeZone: string,
): SchedulerEvent[] {
  const truncated =
    scope === 'following' ? truncateRuleBefore(seriesOf(series, timeZone), from) : null
  if (!truncated) {
    return events.filter((e) => e.id !== series.id && e.recurringEventId !== series.id)
  }
  const rest = dropExceptions(events, series.id, from, timeZone)
  return replace(rest, series.id, { ...series, rrule: stringifyRRule(truncated) })
}

/** One change of several, as carried by `event-drop` and `event-resize`. */
export interface EventEdit extends EventTimes {
  occurrence: EventOccurrence<SchedulerEvent>
  scope?: RecurrenceEditScope
}

/**
 * Applies several changes at once, for one undo step. Pass the payload and its `others`:
 * `applyEventEdits(events, [p, ...p.others], { scope: p.scope, timeZone })`.
 */
export function applyEventEdits(
  events: readonly SchedulerEvent[],
  edits: readonly EventEdit[],
  options: EditOptions,
): SchedulerEvent[] {
  return edits.reduce<SchedulerEvent[]>(
    (list, edit) =>
      applyEventEdit(list, edit.occurrence, edit, {
        ...options,
        scope: edit.scope ?? options.scope,
      }),
    [...events],
  )
}

/** Removes several occurrences at once, for one undo step. */
export function removeEventOccurrences(
  events: readonly SchedulerEvent[],
  occurrences: readonly EventOccurrence<SchedulerEvent>[],
  options: EditOptions,
): SchedulerEvent[] {
  return occurrences.reduce<SchedulerEvent[]>(
    (list, occurrence) => removeEventOccurrence(list, occurrence, options),
    [...events],
  )
}

/** Adds a copy of an occurrence at other times, as a single event with a new id. */
export function duplicateEvent(
  events: readonly SchedulerEvent[],
  occurrence: EventOccurrence<SchedulerEvent>,
  times: EventTimes,
  options: EditOptions,
): SchedulerEvent[] {
  const {
    rrule: _rrule,
    exdates: _ex,
    rdates: _rd,
    recurringEventId: _series,
    recurrenceId: _occurrence,
    ...base
  } = occurrence.event
  const copy: SchedulerEvent = {
    ...base,
    ...formatTimes(times, base.timezone ?? options.timeZone),
    id: (options.createId ?? defaultCreateId)(occurrence.event),
  }
  return [...events, withResources(copy, occurrence, times)]
}

/** Adds what `events-paste` hands over. With `cut` the originals move instead. */
export function pasteEvents(
  events: readonly SchedulerEvent[],
  items: readonly EventEdit[],
  options: EditOptions & { cut?: boolean },
): SchedulerEvent[] {
  return options.cut
    ? applyEventEdits(events, items, options)
    : items.reduce<SchedulerEvent[]>(
        (list, item) => duplicateEvent(list, item.occurrence, item, options),
        [...events],
      )
}

/** How to read and write events of your own shape, for `withCustomEvents`. */
export interface EventMapping<E> {
  /** Your event as a `SchedulerEvent`. */
  read(event: E): SchedulerEvent
  /** A changed event in your shape; `original` is missing for new events. */
  write(next: SchedulerEvent, original: E | undefined): E
}

/**
 * Runs the editing helpers on events of any shape. Unchanged events keep their identity.
 * `withCustomEvents(tasks, mapping, (list) => applyEventEdit(list, plain(p.occurrence), p, opts))`,
 * where the occurrence's `event` is `mapping.read(p.event)`.
 */
export function withCustomEvents<E>(
  events: readonly E[],
  mapping: EventMapping<E>,
  edit: (events: SchedulerEvent[]) => SchedulerEvent[],
): E[] {
  const plain = events.map((e) => mapping.read(e))
  const originals = new Map(plain.map((p, i) => [p, events[i]!]))
  const byId = new Map(plain.map((p, i) => [p.id, events[i]!]))
  return edit(plain).map((next) => originals.get(next) ?? mapping.write(next, byId.get(next.id)))
}
