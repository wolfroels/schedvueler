import type { Temporal } from './temporal'

export type EventId = string | number
export type ResourceId = string | number

/** Any date value the scheduler accepts from user data. */
export type DateInput =
  | string
  | number
  | Date
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate

/**
 * Default event shape. Any other shape works too, as long as matching accessors are supplied.
 *
 * Date strings follow these rules:
 * - `2026-10-29` is a date (all-day unless `allDay: false`)
 * - `2026-10-29T09:00` has no offset and is read as wall-clock time in the event's `timezone`
 * - `2026-10-29T09:00Z`, `...+01:00` or `...[Europe/Brussels]` are exact points in time
 */
export interface SchedulerEvent {
  id: EventId
  title?: string
  start: DateInput
  /** Exclusive end. For all-day events this is the day after the last day. */
  end?: DateInput | null
  allDay?: boolean
  /** IANA zone in which wall-clock times and the recurrence rule are interpreted. */
  timezone?: string
  resourceId?: ResourceId
  resourceIds?: ResourceId[]
  /** RFC 5545 rule, with or without the `RRULE:` prefix. */
  rrule?: string | null
  /** Occurrence starts excluded from the series. */
  exdates?: DateInput[]
  /** Extra occurrence starts added to the series. */
  rdates?: DateInput[]
  /** Marks this event as an edited occurrence of the series with this id. */
  recurringEventId?: EventId
  /** Original start of the occurrence this event replaces. */
  recurrenceId?: DateInput
  /** Any CSS color. Used as the event's accent color by the default theme. */
  color?: string
  /** "background" draws it behind the events, as a holiday or closure. Default "auto". */
  display?: 'auto' | 'background'
  /** Overrides the scheduler's `editable` for this event. */
  editable?: boolean
  /** Overrides `editable` and the scheduler's `eventDraggable` for this event. */
  draggable?: boolean
  /** Overrides `editable` and the scheduler's `eventResizable` for this event. */
  resizable?: boolean
  /** Extra class on this event. */
  class?: string
  /** Any CSS color for the text. */
  textColor?: string
  /** Ids of events this one starts after, drawn as arrows in timelines. */
  dependsOn?: readonly EventId[]
  /** How far along it is, from 0 to 1. Drawn in timelines and Gantt views. */
  progress?: number
  /** Minutes of setup before it. Moves with it, and counts for `event-overlap`. */
  bufferBefore?: number
  /** Minutes of cleanup after it. Moves with it, and counts for `event-overlap`. */
  bufferAfter?: number
}

/** Reads scheduler fields from user event objects, so no wrapper type is required. */
export interface EventAccessors<T> {
  id(event: T): EventId
  title(event: T): string | undefined
  start(event: T): unknown
  end(event: T): unknown
  allDay(event: T): boolean | undefined
  timezone(event: T): string | undefined
  resourceIds(event: T): readonly ResourceId[]
  rrule(event: T): string | null | undefined
  exdates(event: T): readonly unknown[] | undefined
  rdates(event: T): readonly unknown[] | undefined
  recurringEventId(event: T): EventId | undefined
  recurrenceId(event: T): unknown
  color(event: T): string | undefined
  display(event: T): 'auto' | 'background' | undefined
  editable(event: T): boolean | undefined
  draggable(event: T): boolean | undefined
  resizable(event: T): boolean | undefined
  className(event: T): string | undefined
  textColor(event: T): string | undefined
  dependsOn(event: T): readonly EventId[] | undefined
  progress(event: T): number | undefined
  bufferBefore(event: T): number | undefined
  bufferAfter(event: T): number | undefined
}

const EMPTY: readonly never[] = Object.freeze([])

export const defaultAccessors: EventAccessors<SchedulerEvent> = {
  id: (e) => e.id,
  title: (e) => e.title,
  start: (e) => e.start,
  end: (e) => e.end,
  allDay: (e) => e.allDay,
  timezone: (e) => e.timezone,
  resourceIds: (e) => e.resourceIds ?? (e.resourceId != null ? [e.resourceId] : EMPTY),
  rrule: (e) => e.rrule,
  exdates: (e) => e.exdates,
  rdates: (e) => e.rdates,
  recurringEventId: (e) => e.recurringEventId,
  recurrenceId: (e) => e.recurrenceId,
  color: (e) => e.color,
  display: (e) => e.display,
  editable: (e) => e.editable,
  draggable: (e) => e.draggable,
  resizable: (e) => e.resizable,
  className: (e) => e.class,
  textColor: (e) => e.textColor,
  dependsOn: (e) => e.dependsOn,
  progress: (e) => e.progress,
  bufferBefore: (e) => e.bufferBefore,
  bufferAfter: (e) => e.bufferAfter,
}

/** Builds accessors for a custom event shape, falling back to the default field names. */
export function createAccessors<T>(overrides: Partial<EventAccessors<T>> = {}): EventAccessors<T> {
  return { ...(defaultAccessors as unknown as EventAccessors<T>), ...overrides }
}

/** One concrete appearance of an event in time: a single event, or one instance of a series. */
export interface EventOccurrence<T = SchedulerEvent> {
  /** Unique per occurrence: the event id, plus the recurrence id for series instances. */
  readonly key: string
  readonly id: EventId
  /** The user's original event object. */
  readonly event: T
  /** Start in the display time zone. All-day events start at the start of their first day. */
  readonly start: Temporal.ZonedDateTime
  /** Exclusive end in the display time zone. */
  readonly end: Temporal.ZonedDateTime
  readonly startMs: number
  readonly endMs: number
  readonly allDay: boolean
  readonly resourceIds: readonly ResourceId[]
  /** True when this occurrence was generated from a recurrence rule. */
  readonly recurring: boolean
  /** True when this event is an edited occurrence that replaces a generated one. */
  readonly isException: boolean
  /** Original start of the occurrence within its series (generated occurrences and exceptions). */
  readonly recurrenceId?: Temporal.ZonedDateTime | Temporal.PlainDate
  /** Id of the series this occurrence belongs to. */
  readonly seriesId?: EventId
}

/** Half-open epoch-millisecond interval. */
export interface TimeWindow {
  startMs: number
  endMs: number
}
