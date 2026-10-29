import type { HTMLAttributes, StyleValue, VNodeChild } from 'vue'
import type {
  DateAdapter,
  EventAccessors,
  EventOccurrence,
  RangeStrategy,
  RecurrenceEditScope,
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
  /** Number of events on a day, read out with month cells. */
  eventCount: (count: number) => string
  /** Screen-reader hint on editable events. */
  dragHint: string
  /** Announced after an event was moved or resized. */
  eventChanged: (title: string, when: string) => string
  /** Announced when a drag was cancelled. */
  dragCancelled: string
  /** Announced when a range was selected. */
  selected: (when: string) => string
}

export const defaultMessages: SchedulerMessages = {
  today: 'Today',
  previous: 'Previous',
  next: 'Next',
  allDay: 'All day',
  close: 'Close',
  noEvents: 'No events',
  more: (count) => `+${count} more`,
  eventCount: (count) => (count === 1 ? '1 event' : `${count} events`),
  dragHint:
    'Press Alt and the arrow keys to move, Alt Shift and the arrow keys to resize, Delete to remove.',
  eventChanged: (title, when) => `${title} moved to ${when}`,
  dragCancelled: 'Move cancelled',
  selected: (when) => `Selected ${when}`,
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

  // --- interaction ---
  /** Lets users move and resize events. Default false. */
  editable?: boolean
  /** Overrides `editable` for moving. */
  eventDraggable?: boolean
  /** Overrides `editable` for resizing. */
  eventResizable?: boolean
  /** Lets users select a range by dragging over empty slots. Default false. */
  selectable?: boolean
  /** Minutes that moves, resizes and selections snap to. Defaults to `slotDuration`. */
  snapDuration?: number
  /** Whether this occurrence may be moved. */
  canDrag?: (occurrence: EventOccurrence<T>) => boolean
  /** Whether this occurrence may be resized. */
  canResize?: (occurrence: EventOccurrence<T>) => boolean
  /** Whether a move or resize may end here. Invalid targets are shown and dropping there reverts. */
  canDrop?: (info: DropInfo<T>) => boolean
  /** Whether a range may be selected. */
  canSelect?: (info: SelectInfo) => boolean
  /** Scope proposed for changes to recurring events. Default "this". */
  recurrenceEditScope?: RecurrenceEditScope
  /** Touch: how long to press before a drag or selection starts, in ms. Default 400. */
  longPressDelay?: number

  // --- navigation ---
  /** View to open when a date (day header, month day number, agenda day) is clicked. */
  drillDownView?: string
  /** Swipe left/right on touch screens to go to the next/previous period. Default true. */
  swipeNavigation?: boolean
}

export type EventChangeKind = 'move' | 'resize-start' | 'resize-end'

export interface DropInfo<T> {
  occurrence: EventOccurrence<T>
  kind: EventChangeKind
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
}

export interface SelectInfo {
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
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
  /** Only offered while the scheduler is at least this wide (px). */
  minWidth?: number
  /** Only offered while the scheduler is at most this wide (px). */
  maxWidth?: number
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

/** Cancelable: preventing it stops the drill-down to `drillDownView`. */
export interface DateClickPayload extends Cancelable {
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
export interface EventDragStartPayload<T> extends Cancelable {
  occurrence: EventOccurrence<T>
  event: T
  view: string
  kind: EventChangeKind
  nativeEvent: PointerEvent | KeyboardEvent
}

export interface EventDragPayload<T> {
  occurrence: EventOccurrence<T>
  event: T
  view: string
  kind: EventChangeKind
  /** Where the event would land now. */
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  /** False when `canDrop` refuses this spot. */
  valid: boolean
}

export interface EventDragCancelPayload<T> {
  occurrence: EventOccurrence<T>
  event: T
  view: string
  kind: EventChangeKind
  /** "escape", "invalid" (dropped where not allowed), "unchanged" or "prevented" (a before-event refused it). */
  reason: 'escape' | 'invalid' | 'unchanged' | 'prevented'
}

/** A move or resize of an event. */
export interface EventChangePayload<T> {
  occurrence: EventOccurrence<T>
  event: T
  view: string
  kind: EventChangeKind
  oldStart: Temporal.ZonedDateTime
  oldEnd: Temporal.ZonedDateTime
  oldAllDay: boolean
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  /** True for generated occurrences of a recurring event. */
  recurring: boolean
  /**
   * Which occurrences the change is for. Starts as `recurrenceEditScope`; set it in the
   * before-event (e.g. after asking the user) and the after-event carries your choice.
   */
  scope: RecurrenceEditScope
  nativeEvent: PointerEvent | KeyboardEvent
}

export type BeforeEventChangePayload<T> = EventChangePayload<T> & Cancelable

export interface EventChangedPayload<T> extends EventChangePayload<T> {
  /**
   * The scheduler shows the new position right away, until `events` changes. Call `revert()` to
   * put the event back, e.g. when saving fails.
   */
  revert(): void
}

export interface EventDeletePayload<T> {
  occurrence: EventOccurrence<T>
  event: T
  view: string
  recurring: boolean
  scope: RecurrenceEditScope
  nativeEvent: KeyboardEvent
}

export interface SelectPayload {
  view: string
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  nativeEvent: PointerEvent | KeyboardEvent
}

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
  /** A day header (time grid), day number (month) or agenda day was clicked. Cancelable. */
  'date-click': [payload: DateClickPayload]
  /** Before the "+N more" popover opens. Cancelable. */
  'more-click': [payload: MoreClickPayload<T>]

  /** A move or resize starts (pointer passed the threshold, or long press). Cancelable. */
  'event-drag-start': [payload: EventDragStartPayload<T>]
  /** The previewed position changed during a drag. */
  'event-drag': [payload: EventDragPayload<T>]
  /** A drag ended without a change. */
  'event-drag-cancel': [payload: EventDragCancelPayload<T>]
  /** Before a moved event is committed. Cancelable; set `scope` here for recurring events. */
  'before-event-drop': [payload: BeforeEventChangePayload<T>]
  /** An event was moved. Update your data; call `revert()` if that fails. */
  'event-drop': [payload: EventChangedPayload<T>]
  /** Before a resized event is committed. Cancelable. */
  'before-event-resize': [payload: BeforeEventChangePayload<T>]
  /** An event was resized. Update your data; call `revert()` if that fails. */
  'event-resize': [payload: EventChangedPayload<T>]
  /** The user pressed Delete on an editable event. Remove it from your data to delete it. */
  'event-delete': [payload: EventDeletePayload<T>]
  /** A range was selected by dragging (or Shift + arrows and Enter). */
  select: [payload: SelectPayload]
  /** The selection was cleared. */
  unselect: []
}

// ---------------------------------------------------------------------------------------------
// Slot props
// ---------------------------------------------------------------------------------------------

export type EventVariant = 'time' | 'all-day' | 'month' | 'month-timed' | 'list' | 'agenda'

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

export interface AgendaDayHeaderSlotProps {
  view: string
  date: Temporal.PlainDate
  label: string
  isToday: boolean
  count: number
}

export interface NowIndicatorSlotProps {
  now: Temporal.ZonedDateTime
  label: string
}

type SlotFn<P> = (props: P) => VNodeChild

/**
 * Every customizable part. View-specific event slots (`time-event`, `all-day-event`,
 * `month-event`, `agenda-event`) win over `event`; `event-content` only replaces what is inside the default chip.
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
  'agenda-event'?: SlotFn<EventSlotProps<T>>
  'agenda-day-header'?: SlotFn<AgendaDayHeaderSlotProps>
  'agenda-empty'?: SlotFn<{ view: string; label: string }>
}
