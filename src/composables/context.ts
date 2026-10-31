import {
  inject,
  type ComputedRef,
  type InjectionKey,
  type Ref,
  type ShallowRef,
  type Slots,
} from 'vue'
import type {
  EventAccessors,
  EventOccurrence,
  EventStore,
  ResourceId,
  ResourceNode,
  Temporal,
  TimeGridLayoutAlgorithm,
  TimeWindow,
  VisibleRange,
} from '../core'
import type {
  ElementAttrs,
  SchedulerMessages,
  SchedulerOptions,
  SchedulerPart,
  SchedulerPt,
  SchedulerViewDefinition,
} from '../types'
import type { SchedulerInteraction } from './useInteraction'

export interface ViewRegistration {
  id: symbol
  definition: ComputedRef<SchedulerViewDefinition>
  /** Where the view sits in the document, to keep views in declaration order. */
  node: () => Node | null
}

/** Options after defaults are applied. */
export interface ResolvedOptions<T> {
  timeZone: string
  locale: string
  weekStart: number
  hiddenDays: readonly number[]
  hour12: boolean | undefined
  slotDuration: number
  slotLabelInterval: number
  dayStartMinute: number
  dayEndMinute: number
  scrollMinute: number
  eventLayout: TimeGridLayoutAlgorithm
  eventAttrs: ((occurrence: EventOccurrence<T>) => ElementAttrs | undefined) | undefined
  pt: SchedulerPt | undefined
  nowIndicator: boolean
  messages: SchedulerMessages
  raw: SchedulerOptions<T>
}

/** Everything views and parts share. Created by `useScheduler`, read with `useSchedulerContext`. */
export interface SchedulerContext<T = unknown> {
  options: ComputedRef<ResolvedOptions<T>>
  accessors: ComputedRef<EventAccessors<T>>
  /** The event store. Not reactive itself; `version` changes when it does. */
  store: EventStore<T>
  version: Readonly<Ref<number>>
  /** Anchor date the active view is built around. */
  date: ComputedRef<Temporal.PlainDate>
  views: Readonly<ShallowRef<readonly ViewRegistration[]>>
  /** Views that fit the current width (see `minWidth` / `maxWidth`). */
  availableViews: ComputedRef<readonly ViewRegistration[]>
  /** Rendered width of the scheduler in px; 0 until measured. Set by the root component. */
  width: Ref<number>
  activeView: ComputedRef<ViewRegistration | undefined>
  activeViewName: ComputedRef<string | undefined>
  range: ComputedRef<VisibleRange | undefined>
  window: ComputedRef<TimeWindow | undefined>
  /** Occurrences overlapping the visible range, sorted. */
  occurrences: ComputedRef<EventOccurrence<T>[]>
  title: ComputedRef<string>
  today: ComputedRef<Temporal.PlainDate>
  /** Current time, updated every minute. */
  now: Readonly<ShallowRef<Temporal.ZonedDateTime>>

  /** All resources in tree order (parents before their children). */
  resources: ComputedRef<ResourceNode<unknown>[]>
  resourceMap: ComputedRef<ReadonlyMap<ResourceId, ResourceNode<unknown>>>
  /** Resources whose children are hidden. */
  collapsedResources: Readonly<ShallowRef<ReadonlySet<ResourceId>>>
  /** Resources not hidden inside a collapsed group. */
  visibleResources: ComputedRef<ResourceNode<unknown>[]>
  /** Expands or collapses a resource group; toggles when `expanded` is omitted. */
  toggleResource(id: ResourceId, expanded?: boolean): void

  registerView(view: ViewRegistration): void
  unregisterView(view: ViewRegistration): void
  /** Puts the views back in declaration order, after one was added later with `v-if`. */
  sortViews(): void
  prev(): void
  next(): void
  goToday(): void
  goTo(date: Temporal.PlainDate | string): void
  setView(name: string): void
  /** Emits a cancelable `date-click` and then drills down to `drillDownView`, if set. */
  openDate(date: Temporal.PlainDate, view: string, nativeEvent: MouseEvent): void
  /** Re-reads the events, e.g. after mutating event objects in place. */
  refresh(): void

  /** Attributes for a part: its `data-orb-part` name and whatever `pt` gives it. */
  part(name: SchedulerPart, scope?: object): Record<string, unknown>
  /** Emits a scheduler event. Payload types are checked at the call sites in components. */
  emit(name: string, payload: unknown): void
  /** Slots given to the root `<Scheduler>`. */
  slots: Slots
  /**
   * Increments whenever `<Scheduler>` re-renders. Slots are not reactive, so anything that looks a
   * slot up outside the render of the component owning it reads this to stay current.
   */
  slotsVersion: Readonly<Ref<number>>

  /** Drag, resize, selection and optimistic updates. */
  interaction: SchedulerInteraction
  /** Id of the hidden keyboard hint referenced by editable events. */
  hintId: string
  /** Latest screen-reader announcement. */
  announcement: Readonly<Ref<string>>
  /** Announces a message to screen readers through the live region. */
  announce(message: string): void
}

export const SchedulerContextKey: InjectionKey<SchedulerContext<unknown>> = Symbol('orb-scheduler')

export function useSchedulerContext<T = unknown>(): SchedulerContext<T> {
  const ctx = inject(SchedulerContextKey, null)
  if (!ctx) throw new Error('[orb-scheduler] This component must be used inside <Scheduler>.')
  return ctx as SchedulerContext<T>
}

/** "HH:mm" -> minutes since midnight. "24:00" is allowed. */
export function parseTimeOfDay(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return fallback
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes >= 0 && minutes <= 1440 ? minutes : fallback
}
