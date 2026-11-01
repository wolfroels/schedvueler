import type { HTMLAttributes, StyleValue, VNodeChild } from 'vue'
import type {
  BlockedTime,
  BusinessHours,
  DateAdapter,
  EventAccessors,
  EventOccurrence,
  RangeStrategy,
  RefusalReason,
  RecurrenceEditScope,
  ResourceAccessors,
  ResourceId,
  ResourceNode,
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
  /** Marker for events outside the visible hours. */
  hiddenEvents: (count: number, direction: 'before' | 'after') => string
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
  /** Heading of the timeline's resource column. */
  resources: string
}

export const defaultMessages: SchedulerMessages = {
  today: 'Today',
  previous: 'Previous',
  next: 'Next',
  allDay: 'All day',
  close: 'Close',
  noEvents: 'No events',
  more: (count) => `+${count} more`,
  hiddenEvents: (count, direction) => `${direction === 'before' ? '↑' : '↓'} ${count}`,
  eventCount: (count) => (count === 1 ? '1 event' : `${count} events`),
  dragHint:
    'Press Alt and the arrow keys to move, Alt Shift and the arrow keys to resize, Delete to remove.',
  eventChanged: (title, when) => `${title} moved to ${when}`,
  dragCancelled: 'Move cancelled',
  selected: (when) => `Selected ${when}`,
  resources: 'Resources',
}

/** Extra attributes for an event or a cell; merged onto the element the scheduler renders. */
export interface ElementAttrs {
  class?: HTMLAttributes['class']
  style?: StyleValue
  [attr: string]: unknown
}

/** Every element that can be reached with `pt`, and that carries `data-orb-part`. */
export type SchedulerPart =
  | 'root'
  | 'body'
  | 'toolbar'
  | 'toolbarStart'
  | 'toolbarCenter'
  | 'toolbarEnd'
  | 'prevButton'
  | 'nextButton'
  | 'todayButton'
  | 'title'
  | 'viewSwitcher'
  | 'viewButton'
  | 'event'
  | 'eventTitle'
  | 'eventTime'
  | 'eventDot'
  | 'resizer'
  | 'selection'
  | 'nowIndicator'
  | 'timeGrid'
  | 'gridHead'
  | 'dayHeader'
  | 'resourceHeader'
  | 'allDayLabel'
  | 'allDayRow'
  | 'allDayCell'
  | 'gutter'
  | 'timeLabel'
  | 'column'
  | 'timeSlot'
  | 'monthGrid'
  | 'monthWeekday'
  | 'monthWeek'
  | 'monthCell'
  | 'monthDayNumber'
  | 'moreLink'
  | 'popover'
  | 'popoverHeader'
  | 'popoverTitle'
  | 'popoverClose'
  | 'popoverList'
  | 'year'
  | 'yearMonth'
  | 'yearMonthTitle'
  | 'yearWeekday'
  | 'yearDay'
  | 'agenda'
  | 'agendaEmpty'
  | 'agendaDay'
  | 'agendaDayButton'
  | 'agendaRow'
  | 'timeline'
  | 'timelineCorner'
  | 'timelineDayHeading'
  | 'timelineSlotHeading'
  | 'timelineRow'
  | 'resourceLabel'
  | 'resourceToggle'
  | 'timelineLane'
  | 'closedTime'
  | 'blockedTime'
  | 'backgroundEvent'
  | 'hiddenIndicator'

/**
 * Attributes passed through to the parts of the scheduler: classes, styles, `data-*`, listeners.
 * A function receives what is known about that element. Keep the object stable (define it outside
 * the template): a new object on every render re-renders every part.
 */
export type SchedulerPt = Partial<
  Record<
    SchedulerPart,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ElementAttrs | ((scope: Record<string, any>) => ElementAttrs | undefined)
  >
>

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
  /** Attributes for any part of the scheduler. See the slots and parts page in the playground. */
  pt?: SchedulerPt
  /** Show the current-time line. Default true. */
  nowIndicator?: boolean
  messages?: Partial<SchedulerMessages>

  // --- resources ---
  /**
   * Resources (people, rooms, machines) for the timeline and resource columns. Events are linked
   * with `resourceId` / `resourceIds`. Any shape works with `resourceAccessors`.
   */
  resources?: readonly unknown[]
  /** Reads resource fields from custom resource objects. */
  resourceAccessors?: Partial<ResourceAccessors<any>> // eslint-disable-line @typescript-eslint/no-explicit-any

  // --- interaction ---
  // --- availability ---
  /** Opening hours; everything else is shaded. A resource's own `businessHours` wins. */
  businessHours?: BusinessHours
  /** Refuse moves, resizes, selections and drops outside business hours. */
  businessHoursOnly?: boolean
  /** Times nothing can be placed in, drawn as blocked. */
  blockedTimes?: readonly BlockedTime[]
  /** Whether a range is off limits; refuses selections, moves, resizes and drops there. */
  isSlotDisabled?: (info: SelectInfo) => boolean
  /** First date that can be navigated to or edited, "YYYY-MM-DD". */
  minDate?: string
  /** Last date that can be navigated to or edited, "YYYY-MM-DD". */
  maxDate?: string
  /** Whether events may overlap after a change. A function decides per pair. Default "allow". */
  eventOverlap?: 'allow' | 'forbid' | ((info: OverlapInfo<T>) => boolean)
  /** Shortest and longest length in minutes, for all events or per event. */
  durationLimits?: DurationLimits | ((occurrence: EventOccurrence<T> | undefined) => DurationLimits)
  /** Extra class, style or attributes per cell (time slots, all-day cells, month cells). */
  slotAttrs?: (
    info: SelectInfo & { view: string; date: Temporal.PlainDate },
  ) => ElementAttrs | undefined

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
  /**
   * Whether an event dragged in from outside (`v-orb-draggable`) may be dropped here. Refused spots
   * show the preview in red and the drop does nothing.
   */
  canReceive?: (info: ReceiveInfo) => boolean

  // --- navigation ---
  /** View to open when a date (day header, month day number, agenda day) is clicked. */
  drillDownView?: string
  /** Swipe left/right on touch screens to go to the next/previous period. Default true. */
  swipeNavigation?: boolean
}

export interface DurationLimits {
  /** Minutes. */
  min?: number
  /** Minutes. */
  max?: number
}

export interface OverlapInfo<T> {
  /** What is being placed; missing for a selection or an event from outside. */
  occurrence: EventOccurrence<T> | undefined
  /** The event it would overlap. */
  other: EventOccurrence<T>
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
}

export type EventChangeKind = 'move' | 'resize-start' | 'resize-end'

export interface DropInfo<T> {
  occurrence: EventOccurrence<T>
  kind: EventChangeKind
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  /** Resources the event would have after the drop. */
  resourceIds: readonly ResourceId[]
}

/**
 * An event that can be dragged into any scheduler from outside, e.g. a sidebar item with
 * `v-orb-draggable="template"`. All fields are optional.
 */
export interface ExternalEventTemplate<E = unknown> {
  /** Shown on the drag preview (when `event` is not given) and the floating chip. */
  title?: string
  color?: string
  /**
   * An event object in your own shape, used to draw the preview with your accessors and slots.
   * Defaults to `{ title, color }`.
   */
  event?: E
  /** Anything you need back in `event-receive` (an id, the whole item, ...). */
  data?: unknown
  /**
   * `true`: dropped on a day (month, all-day row, day-slot timeline) it becomes all-day; that is
   * also the default. `false`: it is always timed, starting at `startTime` when dropped on a day.
   * Dropped in a time grid it is always timed.
   */
  allDay?: boolean
  /** Length when timed, in minutes. Defaults to `defaultEventDuration`. */
  duration?: number
  /** Length when all-day, in days. Default 1. */
  days?: number
  /** Start time when a timed template is dropped on a day, "HH:mm". Default "09:00". */
  startTime?: string
}

export interface ReceiveInfo {
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  /** The resource under the pointer, as a list (empty outside resource views). */
  resourceIds: readonly ResourceId[]
  resourceId: ResourceId | undefined
  template: ExternalEventTemplate
}

export interface SelectInfo {
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  /** Resource the range is selected on (resource columns, timeline rows). */
  resourceId?: ResourceId
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
  /** Days run past midnight: fetch one more day of events. */
  overnight?: boolean
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

/** A move or resize was refused. */
export interface EventChangeFailedPayload<T> {
  occurrence: EventOccurrence<T>
  event: T
  view: string
  kind: EventChangeKind
  reason: RefusalReason
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  resourceIds: readonly ResourceId[]
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
  /** Resource of the column or timeline row. */
  resourceId?: ResourceId
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
  resourceIds: readonly ResourceId[]
  /** False when `canDrop` refuses this spot. */
  valid: boolean
}

export interface EventDragCancelPayload<T> {
  occurrence: EventOccurrence<T>
  event: T
  view: string
  kind: EventChangeKind
  /** "escape", "invalid" (dropped where not allowed), "unchanged", "outside" (let go off the scheduler) or "prevented" (a before-event refused it). */
  reason: 'escape' | 'invalid' | 'unchanged' | 'outside' | 'prevented'
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
  oldResourceIds: readonly ResourceId[]
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  /** Resources after the change; differs from `oldResourceIds` when moved to another resource. */
  resourceIds: readonly ResourceId[]
  /** True for occurrences of a recurring event, edited ones included. */
  recurring: boolean
  /**
   * Which occurrences the change is for. Starts as `recurrenceEditScope`; set it in the
   * before-event (e.g. after asking the user) and the after-event carries your choice.
   */
  scope: RecurrenceEditScope
  nativeEvent: PointerEvent | KeyboardEvent
  /** The event's element as it is now, to anchor your own popover. */
  getElement(): HTMLElement | null
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
  /** The event's element, to anchor your own confirmation. */
  element: HTMLElement
}

export type BeforeEventDeletePayload<T> = EventDeletePayload<T> & Cancelable

export interface SelectPayload {
  view: string
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  /** Resource the range was selected on. */
  resourceId?: ResourceId
  nativeEvent: PointerEvent | KeyboardEvent
  /** The element of the selected range, to anchor your own popover. */
  getElement(): HTMLElement | null
}

/** An event dragged in from outside was dropped. Add it to your data. */
export interface EventReceivePayload extends ReceiveInfo {
  view: string
  /** `template.data`, for convenience. */
  data: unknown
  nativeEvent: PointerEvent
}

export type BeforeEventReceivePayload = EventReceivePayload & Cancelable

export interface ResourcePointerPayload {
  resource: ResourceNode<unknown>
  view: string
  nativeEvent: MouseEvent
  element: HTMLElement
}

export interface ResourceTogglePayload {
  resource: ResourceNode<unknown>
  expanded: boolean
}

/** The resources shown in a timeline changed (scrolling, collapsing, navigating). */
export interface VisibleResourcesPayload {
  view: string
  /** Ids of the rendered rows, including the overscan. */
  resourceIds: ResourceId[]
  start: Temporal.PlainDate
  end: Temporal.PlainDate
  startMs: number
  endMs: number
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
  /** A move or resize was refused by a rule, and the event stays where it was. */
  'event-change-failed': [payload: EventChangeFailedPayload<T>]
  /** Before `event-delete`. Cancelable, e.g. to ask for confirmation first. */
  'before-event-delete': [payload: BeforeEventDeletePayload<T>]
  /** The user pressed Delete on an editable event. Remove it from your data to delete it. */
  'event-delete': [payload: EventDeletePayload<T>]
  /** A range was selected by dragging (or Shift + arrows and Enter). */
  select: [payload: SelectPayload]
  /** Before an event dragged in from outside is dropped. Cancelable. */
  'before-event-receive': [payload: BeforeEventReceivePayload]
  /** An event dragged in from outside was dropped here. Add it to your data. */
  'event-receive': [payload: EventReceivePayload]
  /** The selection was cleared. */
  unselect: []
  /** A resource label was clicked. */
  'resource-click': [payload: ResourcePointerPayload]
  /** A resource group was expanded or collapsed. */
  'resource-toggle': [payload: ResourceTogglePayload]
  /** Different timeline rows came into view. Use it to load events for just those resources. */
  'visible-resources-change': [payload: VisibleResourcesPayload]
}

// ---------------------------------------------------------------------------------------------
// Slot props
// ---------------------------------------------------------------------------------------------

export type EventVariant =
  'time' | 'all-day' | 'month' | 'month-timed' | 'list' | 'agenda' | 'timeline'

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
  /** The event's color, or else the color of its (first) resource. */
  color: string | undefined
  /** Resource of the column or timeline row the event is shown in. */
  resourceId: ResourceId | undefined
  /** This is the preview of a drag. */
  isMirror: boolean
  /** For a drag preview: false over a spot that is not allowed. */
  valid: boolean
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
  resourceId?: ResourceId
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

export interface ResourceLabelSlotProps {
  view: string
  resource: ResourceNode<unknown>
  title: string
  /** Timeline only: nesting depth, and whether the group is expanded. */
  depth: number
  expanded: boolean
  hasChildren: boolean
  toggle(): void
}

export interface TimelineHeaderSlotProps {
  view: string
  date: Temporal.PlainDate
  /** Wall-clock minute of the slot, or `undefined` for a day heading. */
  minute: number | undefined
  label: string
  isToday: boolean
}

export interface YearDaySlotProps<T> {
  view: string
  date: Temporal.PlainDate
  dayNumber: string
  isToday: boolean
  count: number
  occurrences: EventOccurrence<T>[]
  /** 0 without events, otherwise 1-4 relative to the busiest day of the year. */
  level: number
}

export interface NowIndicatorSlotProps {
  now: Temporal.ZonedDateTime
  label: string
}

export interface SelectionSlotProps {
  view: string
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  resourceId: ResourceId | undefined
}

export interface ShadeSlotProps<T> {
  view: string
  date: Temporal.PlainDate | undefined
  resourceId: ResourceId | undefined
  title: string | undefined
  color: string | undefined
  occurrence: EventOccurrence<T> | undefined
}

export interface HiddenEventsSlotProps<T> {
  view: string
  date: Temporal.PlainDate
  /** Whether they are before or after the visible hours. */
  direction: 'before' | 'after'
  count: number
  occurrences: EventOccurrence<T>[]
  label: string
}

type SlotFn<P> = (props: P) => VNodeChild

/**
 * Every customizable part. View-specific event slots (`time-event`, `all-day-event`,
 * `month-event`, `agenda-event`, `timeline-event`) win over `event`; `event-content` only replaces what is inside the default chip.
 */
export interface SchedulerSlots<T> {
  default?: () => VNodeChild
  toolbar?: SlotFn<ToolbarSlotProps>
  'toolbar-start'?: SlotFn<ToolbarSlotProps>
  'toolbar-center'?: SlotFn<ToolbarSlotProps>
  'toolbar-end'?: SlotFn<ToolbarSlotProps>
  title?: SlotFn<ToolbarSlotProps>
  /** The previous button. */
  'nav-prev'?: SlotFn<{ prev(): void; label: string }>
  /** The next button. */
  'nav-next'?: SlotFn<{ next(): void; label: string }>
  /** The today button. */
  'today-button'?: SlotFn<{ today(): void; label: string }>
  /** The whole view switcher. */
  'view-switcher'?: SlotFn<ToolbarSlotProps>
  /** One button of the view switcher. */
  'view-button'?: SlotFn<{
    view: { name: string; label: string; active: boolean }
    setView(name: string): void
  }>
  event?: SlotFn<EventSlotProps<T>>
  'event-content'?: SlotFn<EventSlotProps<T>>
  'time-event'?: SlotFn<EventSlotProps<T>>
  'all-day-event'?: SlotFn<EventSlotProps<T>>
  'month-event'?: SlotFn<EventSlotProps<T>>
  /** The preview shown during a drag, instead of the normal event slots. */
  'drag-preview'?: SlotFn<EventSlotProps<T>>
  /** The inside of a resize handle. */
  'resize-handle'?: SlotFn<{ edge: 'start' | 'end'; variant: EventVariant }>
  /** The inside of a background event. */
  'background-event'?: SlotFn<ShadeSlotProps<T>>
  /** The inside of a blocked time. */
  'blocked-time'?: SlotFn<ShadeSlotProps<T>>
  /** The inside of a closed time, outside business hours. */
  'closed-time'?: SlotFn<ShadeSlotProps<T>>
  /** The marker for events outside the visible hours. */
  'hidden-events'?: SlotFn<HiddenEventsSlotProps<T>>
  /** The inside of the selected range (time grid, all-day row, timeline). */
  selection?: SlotFn<SelectionSlotProps>
  'day-header'?: SlotFn<DayHeaderSlotProps>
  'all-day-label'?: SlotFn<{ label: string }>
  'time-label'?: SlotFn<TimeLabelSlotProps>
  'time-slot'?: SlotFn<TimeSlotSlotProps>
  'month-weekday'?: SlotFn<{ weekday: number; label: string }>
  'month-cell'?: SlotFn<MonthCellSlotProps>
  /** The inside of the day number button in a month cell. */
  'month-day-number'?: SlotFn<MonthCellSlotProps>
  'more-link'?: SlotFn<MoreLinkSlotProps<T>>
  'more-popover'?: SlotFn<MorePopoverSlotProps<T>>
  'now-indicator'?: SlotFn<NowIndicatorSlotProps>
  'agenda-event'?: SlotFn<EventSlotProps<T>>
  'agenda-day-header'?: SlotFn<AgendaDayHeaderSlotProps>
  'agenda-empty'?: SlotFn<{ view: string; label: string }>
  'timeline-event'?: SlotFn<EventSlotProps<T>>
  /** A resource heading (time-grid columns) or row label (timeline). */
  'resource-label'?: SlotFn<ResourceLabelSlotProps>
  /** Top-left corner above the timeline's resource column. */
  'resource-area-header'?: SlotFn<{ view: string; label: string }>
  /** Day and slot headings of the timeline. */
  'timeline-header'?: SlotFn<TimelineHeaderSlotProps>
  /** A day in the year view (inside its button). */
  'year-day'?: SlotFn<YearDaySlotProps<T>>
  /** A month name in the year view. */
  'year-month-header'?: SlotFn<{ view: string; date: Temporal.PlainDate; label: string }>
}
