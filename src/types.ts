import type { HTMLAttributes, StyleValue, VNodeChild } from 'vue'
import type {
  DateAdapter,
  EventAccessors,
  EventOccurrence,
  RangeStrategy,
  Temporal,
  TimeGridLayoutAlgorithm,
  VisibleRange,
} from './core'

// ---------------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------------

export interface SchedulerMessages {
  today: string
  previous: string
  next: string
  allDay: string
  close: string
  noEvents: string
  /** Label of the overflow link, e.g. "+3 more". */
  more: (count: number) => string
}

export const defaultMessages: SchedulerMessages = {
  today: 'Today',
  previous: 'Previous',
  next: 'Next',
  allDay: 'All day',
  close: 'Close',
  noEvents: 'No events',
  more: (count) => `+${count} more`,
}

/** Extra attributes for an event or a cell; merged onto the element the scheduler renders. */
export interface ElementAttrs {
  class?: HTMLAttributes['class']
  style?: StyleValue
  [attr: string]: unknown
}

export type EventLayoutOption = 'columns' | 'stack' | TimeGridLayoutAlgorithm

/** Options shared by every view. Views can override most of them with their own props. */
export interface SchedulerOptions<T> {
  events: readonly T[]
  accessors?: Partial<EventAccessors<T>>
  dateAdapter?: Pick<DateAdapter<unknown>, 'parse'>
  /** Display zone (IANA). Defaults to the browser's zone. */
  timeZone?: string
  /** Zone for event times without offset. Defaults to `timeZone`. */
  eventTimeZone?: string
  /** BCP 47 locale. Defaults to the browser's locale. */
  locale?: string
  /** ISO weekday the week starts on (1 = Monday ... 7 = Sunday). Defaults to the locale's. */
  weekStart?: number
  /** ISO weekdays to hide, e.g. `[6, 7]`. */
  hiddenDays?: readonly number[]
  /** Force a 12- or 24-hour clock. Defaults to the locale's. */
  hour12?: boolean
  /** Minutes per time-grid slot. Default 30. */
  slotDuration?: number
  /** Minutes between time labels. Default 60. */
  slotLabelInterval?: number
  /** First visible time in the time grid, "HH:mm". Default "00:00". */
  dayStartTime?: string
  /** Last visible time in the time grid, "HH:mm". Default "24:00". */
  dayEndTime?: string
  /** Time scrolled into view when a time grid opens, "HH:mm". Default "08:00". */
  scrollTime?: string
  /** Default length of timed events without an end, in minutes. Default 60. */
  defaultEventDuration?: number
  /** How overlapping timed events share a day column. Default "columns". */
  eventLayout?: EventLayoutOption
  eventOrder?: (a: EventOccurrence<T>, b: EventOccurrence<T>) => number
  /** Extra class/style/attributes per event. Must be a pure function. */
  eventAttrs?: (occurrence: EventOccurrence<T>) => ElementAttrs | undefined
  /** Show the current-time line. Default true. */
  nowIndicator?: boolean
  messages?: Partial<SchedulerMessages>
}

// ---------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------

export interface SchedulerViewDefinition {
  /** Unique name, used by `v-model:view`. */
  name: string
  /** Text in the view switcher. */
  label: string
  strategy: RangeStrategy
  /** Toolbar title for a range. */
  title(range: VisibleRange, locale: string): string
}

// ---------------------------------------------------------------------------------------------
// Emit payloads
// ---------------------------------------------------------------------------------------------

/**
 * Payload of "before" events. Call `preventDefault()` to cancel the default action, or
 * `waitUntil(promise)` to delay it; it is cancelled when the promise rejects or resolves to `false`.
 */
export interface Cancelable {
  preventDefault(): void
  readonly defaultPrevented: boolean
  waitUntil(promise: Promise<unknown>): void
}

export interface RangeChangePayload {
  view: string
  /** First visible day. */
  start: Temporal.PlainDate
  /** Day after the last visible day. */
  end: Temporal.PlainDate
  /** The period the view is about (the month itself in month view). */
  activeStart: Temporal.PlainDate
  activeEnd: Temporal.PlainDate
  startMs: number
  endMs: number
  timeZone: string
}

export type NavigateReason = 'prev' | 'next' | 'today' | 'date'

export interface NavigatePayload extends Cancelable {
  view: string
  from: Temporal.PlainDate
  to: Temporal.PlainDate
  reason: NavigateReason
}

export interface ViewChangePayload extends Cancelable {
  from: string | undefined
  to: string
}

export interface EventPointerPayload<T> {
  occurrence: EventOccurrence<T>
  event: T
  view: string
  nativeEvent: MouseEvent
  /** The event's element, e.g. to anchor your own popover. */
  element: HTMLElement
}

export interface EventKeyPayload<T> extends Omit<EventPointerPayload<T>, 'nativeEvent'> {
  nativeEvent: KeyboardEvent
}

export interface SlotPointerPayload {
  view: string
  date: Temporal.PlainDate
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  nativeEvent: MouseEvent
  element: HTMLElement
}

export interface DateClickPayload {
  view: string
  date: Temporal.PlainDate
  nativeEvent: MouseEvent
  element: HTMLElement
}

export interface MoreClickPayload<T> extends Cancelable {
  view: string
  date: Temporal.PlainDate
  /** Every occurrence on that day, including the visible ones. */
  occurrences: EventOccurrence<T>[]
  hiddenCount: number
  nativeEvent: MouseEvent
  element: HTMLElement
}

/** Events emitted by `<Scheduler>`, besides the `update:date` / `update:view` model updates. */
export interface SchedulerEmits<T> {
  /** The visible range changed. Use it to load events for that range. */
  'range-change': [payload: RangeChangePayload]
  /** Before the date changes. Cancelable. */
  navigate: [payload: NavigatePayload]
  /** Before the view changes. Cancelable. */
  'view-change': [payload: ViewChangePayload]
  'event-click': [payload: EventPointerPayload<T>]
  'event-dblclick': [payload: EventPointerPayload<T>]
  'event-contextmenu': [payload: EventPointerPayload<T>]
  'event-mouseenter': [payload: EventPointerPayload<T>]
  'event-mouseleave': [payload: EventPointerPayload<T>]
  'event-keydown': [payload: EventKeyPayload<T>]
  'slot-click': [payload: SlotPointerPayload]
  'slot-dblclick': [payload: SlotPointerPayload]
  'slot-contextmenu': [payload: SlotPointerPayload]
  /** A day header (time grid) or day number (month) was clicked. */
  'date-click': [payload: DateClickPayload]
  /** Before the "+N more" popover opens. Cancelable. */
  'more-click': [payload: MoreClickPayload<T>]
}

// ---------------------------------------------------------------------------------------------
// Slot props
// ---------------------------------------------------------------------------------------------

export type EventVariant = 'time' | 'all-day' | 'month' | 'month-timed' | 'list'

export interface EventSlotProps<T> {
  occurrence: EventOccurrence<T>
  event: T
  title: string
  /** Formatted time, e.g. "09:00 – 10:30". Empty for all-day events. */
  timeText: string
  view: string
  variant: EventVariant
  allDay: boolean
  /** The occurrence starts / ends in this segment (false when it continues from or into another day). */
  isStart: boolean
  isEnd: boolean
  isPast: boolean
  color: string | undefined
}

export interface ToolbarSlotProps {
  title: string
  view: string | undefined
  views: { name: string; label: string; active: boolean }[]
  prev(): void
  next(): void
  today(): void
  setView(name: string): void
}

export interface DayHeaderSlotProps {
  date: Temporal.PlainDate
  view: string
  isToday: boolean
  weekday: string
  dayNumber: string
}

export interface TimeLabelSlotProps {
  minute: number
  label: string
}

export interface TimeSlotSlotProps {
  view: string
  date: Temporal.PlainDate
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  isToday: boolean
}

export interface MonthCellSlotProps {
  view: string
  date: Temporal.PlainDate
  dayNumber: string
  isToday: boolean
  isOtherMonth: boolean
  isPast: boolean
}

export interface MoreLinkSlotProps<T> {
  date: Temporal.PlainDate
  count: number
  occurrences: EventOccurrence<T>[]
  label: string
}

export interface MorePopoverSlotProps<T> {
  date: Temporal.PlainDate
  title: string
  occurrences: EventOccurrence<T>[]
  close(): void
}

export interface NowIndicatorSlotProps {
  now: Temporal.ZonedDateTime
  label: string
}

type SlotFn<P> = (props: P) => VNodeChild

/**
 * Every customizable part. View-specific event slots (`time-event`, `all-day-event`,
 * `month-event`) win over `event`; `event-content` only replaces what is inside the default chip.
 */
export interface SchedulerSlots<T> {
  default?: () => VNodeChild
  toolbar?: SlotFn<ToolbarSlotProps>
  'toolbar-start'?: SlotFn<ToolbarSlotProps>
  'toolbar-center'?: SlotFn<ToolbarSlotProps>
  'toolbar-end'?: SlotFn<ToolbarSlotProps>
  title?: SlotFn<ToolbarSlotProps>
  event?: SlotFn<EventSlotProps<T>>
  'event-content'?: SlotFn<EventSlotProps<T>>
  'time-event'?: SlotFn<EventSlotProps<T>>
  'all-day-event'?: SlotFn<EventSlotProps<T>>
  'month-event'?: SlotFn<EventSlotProps<T>>
  'day-header'?: SlotFn<DayHeaderSlotProps>
  'all-day-label'?: SlotFn<{ label: string }>
  'time-label'?: SlotFn<TimeLabelSlotProps>
  'time-slot'?: SlotFn<TimeSlotSlotProps>
  'month-weekday'?: SlotFn<{ weekday: number; label: string }>
  'month-cell'?: SlotFn<MonthCellSlotProps>
  'more-link'?: SlotFn<MoreLinkSlotProps<T>>
  'more-popover'?: SlotFn<MorePopoverSlotProps<T>>
  'now-indicator'?: SlotFn<NowIndicatorSlotProps>
}
