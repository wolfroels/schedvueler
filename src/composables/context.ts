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
  Temporal,
  TimeGridLayoutAlgorithm,
  TimeWindow,
  VisibleRange,
} from '../core'
import type {
  ElementAttrs,
  SchedulerMessages,
  SchedulerOptions,
  SchedulerViewDefinition,
} from '../types'
import type { SchedulerInteraction } from './useInteraction'

export interface ViewRegistration {
  id: symbol
  definition: ComputedRef<SchedulerViewDefinition>
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

  registerView(view: ViewRegistration): void
  unregisterView(view: ViewRegistration): void
  prev(): void
  next(): void
  goToday(): void
  goTo(date: Temporal.PlainDate | string): void
  setView(name: string): void
  /** Re-reads the events, e.g. after mutating event objects in place. */
  refresh(): void

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
