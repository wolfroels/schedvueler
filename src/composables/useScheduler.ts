import {
  computed,
  getCurrentInstance,
  getCurrentScope,
  onBeforeUpdate,
  markRaw,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
  useId,
  useSlots,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type Slots,
} from 'vue'
import {
  EventStore,
  Temporal,
  buildResourceTree,
  createAccessors,
  createResourceAccessors,
  visibleResources as visibleResourceNodes,
  type ResourceId,
  now as zonedNow,
  rangeToWindow,
  systemTimeZone,
  timeGridLayouts,
  type EventOccurrence,
  type VisibleRange,
  weekStartForLocale,
} from '../core'
import { defaultMessages, type SchedulerOptions } from '../types'
import { createCancelable, whenAllowed } from './cancelable'
import { createInteraction, type SchedulerInteraction } from './useInteraction'
import {
  SchedulerContextKey,
  parseTimeOfDay,
  type ResolvedOptions,
  type SchedulerContext,
  type ViewRegistration,
} from './context'

export interface UseSchedulerState {
  /** Anchor date as "YYYY-MM-DD". `undefined` means today. */
  date: Ref<string | undefined>
  /** Active view name. `undefined` means the first registered view. */
  view: Ref<string | undefined>
}

export interface UseSchedulerHooks {
  emit?: (name: string, payload: unknown) => void
  slots?: Slots
}

function defaultLocale(): string {
  return typeof navigator !== 'undefined' && navigator.language
    ? navigator.language
    : new Intl.DateTimeFormat().resolvedOptions().locale
}

/**
 * Headless scheduler state: event store, view registry, navigation and the visible range.
 * Provides the context to descendant views. `<Scheduler>` is a thin shell around this; use it
 * directly to build a completely custom UI.
 */
export function useScheduler<T>(
  options: MaybeRefOrGetter<SchedulerOptions<T>>,
  state: UseSchedulerState,
  hooks: UseSchedulerHooks = {},
): SchedulerContext<T> {
  const raw = computed(() => toValue(options))
  const emit = hooks.emit ?? (() => {})
  const slots = hooks.slots ?? useSlots()

  const timeZone = computed(() => raw.value.timeZone ?? systemTimeZone())
  const locale = computed(() => raw.value.locale ?? defaultLocale())

  const resolved = computed<ResolvedOptions<T>>(() => {
    const o = raw.value
    const layout = o.eventLayout ?? 'columns'
    return {
      timeZone: timeZone.value,
      locale: locale.value,
      weekStart: o.weekStart ?? weekStartForLocale(locale.value),
      hiddenDays: o.hiddenDays ?? [],
      hour12: o.hour12,
      slotDuration: o.slotDuration ?? 30,
      slotLabelInterval: o.slotLabelInterval ?? 60,
      dayStartMinute: parseTimeOfDay(o.dayStartTime, 0),
      dayEndMinute: parseTimeOfDay(o.dayEndTime, 1440),
      scrollMinute: parseTimeOfDay(o.scrollTime, 480),
      eventLayout: typeof layout === 'function' ? layout : timeGridLayouts[layout],
      eventAttrs: o.eventAttrs,
      nowIndicator: o.nowIndicator ?? true,
      messages: { ...defaultMessages, ...o.messages },
      raw: o,
    }
  })

  // --- events -----------------------------------------------------------------------------------

  // A computed only notifies dependents when its value changes, so reading the input through its
  // own computed keeps unrelated prop changes from rebuilding the accessors (and re-reading events).
  const accessorsInput = computed(() => raw.value.accessors)
  const accessors = computed(() => createAccessors<T>(accessorsInput.value))
  const store = markRaw(new EventStore<T>([], storeOptions()))
  const version = shallowRef(0)

  function storeOptions() {
    const o = raw.value
    return {
      timeZone: timeZone.value,
      eventTimeZone: o.eventTimeZone,
      accessors: accessors.value,
      adapter: o.dateAdapter,
      defaultTimedDurationMs: (o.defaultEventDuration ?? 60) * 60_000,
      eventOrder: o.eventOrder,
    }
  }

  watch(
    [
      timeZone,
      accessors,
      () => raw.value.eventTimeZone,
      () => raw.value.dateAdapter,
      () => raw.value.defaultEventDuration,
      () => raw.value.eventOrder,
    ],
    () => {
      store.configure(storeOptions())
      version.value = store.version
    },
  )

  // `deep: 1` also catches push/splice on the array; event objects themselves are treated as immutable.
  watch(
    () => raw.value.events,
    (events) => {
      store.setEvents(events ?? [])
      version.value = store.version
    },
    { immediate: true, deep: 1 },
  )

  // --- resources --------------------------------------------------------------------------------

  const resourceAccessorsInput = computed(() => raw.value.resourceAccessors)
  const resourceAccessors = computed(() => createResourceAccessors(resourceAccessorsInput.value))
  const resourcesInput = computed(() => raw.value.resources)
  const resources = computed(() =>
    buildResourceTree(resourcesInput.value ?? [], resourceAccessors.value),
  )
  const resourceMap = computed(() => new Map(resources.value.map((r) => [r.id, r])))
  const collapsedResources = shallowRef<ReadonlySet<ResourceId>>(new Set())
  const visibleResources = computed(() =>
    visibleResourceNodes(resources.value, collapsedResources.value),
  )

  // --- current time ----------------------------------------------------------------------------

  const now = shallowRef(zonedNow(timeZone.value))
  let timer: ReturnType<typeof setTimeout> | undefined
  function tick() {
    now.value = zonedNow(timeZone.value)
    // Wake up at the start of the next minute.
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
  }
  if (typeof globalThis.window !== 'undefined') tick()
  watch(timeZone, () => (now.value = zonedNow(timeZone.value)))
  if (getCurrentScope()) onScopeDispose(() => clearTimeout(timer))

  // --- views and navigation -------------------------------------------------------------------

  const views = shallowRef<readonly ViewRegistration[]>([])
  // Returning the previous object when nothing changed keeps everything downstream from
  // recomputing every minute when the clock ticks.
  const today = computed<Temporal.PlainDate>((old) => {
    const value = now.value.toPlainDate()
    return old?.equals(value) ? old : value
  })
  const date = computed<Temporal.PlainDate>((old) => {
    let value = today.value
    if (state.date.value) {
      try {
        value = Temporal.PlainDate.from(state.date.value)
      } catch {
        // invalid input: stay on today
      }
    }
    return old?.equals(value) ? old : value
  })
  const width = shallowRef(0)
  const availableViews = computed(() => {
    const w = width.value
    if (!w) return views.value
    const fits = views.value.filter((v) => {
      const { minWidth, maxWidth } = v.definition.value
      return (minWidth === undefined || w >= minWidth) && (maxWidth === undefined || w <= maxWidth)
    })
    return fits.length ? fits : views.value
  })
  // The requested view (v-model) is kept; when it does not fit, the first view that does is shown.
  const activeView = computed(() => {
    const list = availableViews.value
    return list.find((v) => v.definition.value.name === state.view.value) ?? list[0]
  })
  const activeViewName = computed(() => activeView.value?.definition.value.name)
  const range = computed<VisibleRange | undefined>((old) => {
    const value = activeView.value?.definition.value.strategy.range(date.value)
    if (old && value && old.start.equals(value.start) && old.end.equals(value.end)) return old
    return value
  })
  const timeWindow = computed(() =>
    range.value ? rangeToWindow(range.value, timeZone.value) : undefined,
  )
  // Occurrences straight from the store, before optimistic drag/resize results are applied.
  const queried = computed(() => {
    void version.value
    return timeWindow.value ? store.query(timeWindow.value) : []
  })
  const title = computed(() =>
    range.value && activeView.value
      ? activeView.value.definition.value.title(range.value, locale.value)
      : '',
  )

  function navigate(to: Temporal.PlainDate, reason: 'prev' | 'next' | 'today' | 'date') {
    const from = date.value
    if (Temporal.PlainDate.compare(from, to) === 0 && state.date.value) return
    const { payload, settle } = createCancelable({
      view: activeViewName.value ?? '',
      from,
      to,
      reason,
    })
    emit('navigate', payload)
    whenAllowed(settle(), () => {
      state.date.value = to.toString()
    })
  }

  const step = (direction: 1 | -1) => {
    const view = activeView.value
    if (view)
      navigate(
        view.definition.value.strategy.step(date.value, direction),
        direction > 0 ? 'next' : 'prev',
      )
  }

  // --- range-change ----------------------------------------------------------------------------

  watch(
    () => {
      const r = range.value
      const w = timeWindow.value
      return r && w ? `${activeViewName.value}|${r.start}|${r.end}|${timeZone.value}` : ''
    },
    (key) => {
      const r = range.value
      const w = timeWindow.value
      if (!key || !r || !w) return
      emit('range-change', {
        view: activeViewName.value ?? '',
        start: r.start,
        end: r.end,
        activeStart: r.active.start,
        activeEnd: r.active.end,
        startMs: w.startMs,
        endMs: w.endMs,
        timeZone: timeZone.value,
      })
    },
    { flush: 'post' },
  )

  // New slot functions arrive with every re-render of the owning component.
  const slotsVersion = shallowRef(0)
  if (getCurrentInstance()) onBeforeUpdate(() => slotsVersion.value++)

  const occurrences = computed(
    () => ctx.interaction.applyPending(queried.value) as EventOccurrence<T>[],
  )
  watch(version, () => ctx.interaction.prunePending())

  const announcement = shallowRef('')

  const ctx: SchedulerContext<T> = {
    options: resolved,
    accessors,
    store,
    version,
    date,
    views,
    availableViews,
    width,
    activeView,
    activeViewName,
    range,
    window: timeWindow,
    occurrences,
    title,
    today,
    now,
    resources,
    resourceMap,
    collapsedResources,
    visibleResources,
    toggleResource(id, expanded) {
      const node = resourceMap.value.get(id)
      if (!node || !node.childIds.length) return
      const isExpanded = !collapsedResources.value.has(id)
      const next = expanded ?? !isExpanded
      if (next === isExpanded) return
      const set = new Set(collapsedResources.value)
      if (next) set.delete(id)
      else set.add(id)
      collapsedResources.value = set
      emit('resource-toggle', { resource: node, expanded: next })
    },
    registerView(view) {
      views.value = [...views.value, view]
    },
    unregisterView(view) {
      views.value = views.value.filter((v) => v !== view)
    },
    prev: () => step(-1),
    next: () => step(1),
    goToday: () => navigate(today.value, 'today'),
    goTo: (value) =>
      navigate(typeof value === 'string' ? Temporal.PlainDate.from(value) : value, 'date'),
    setView(name) {
      const from = activeViewName.value
      if (from === name) return
      const { payload, settle } = createCancelable({ from, to: name })
      emit('view-change', payload)
      whenAllowed(settle(), () => {
        state.view.value = name
      })
    },
    openDate(target, view, nativeEvent) {
      const { payload, settle } = createCancelable({
        view,
        date: target,
        nativeEvent,
        element: nativeEvent.currentTarget as HTMLElement,
      })
      emit('date-click', payload)
      const drill = raw.value.drillDownView
      if (!drill) return
      whenAllowed(settle(), () => {
        if (drill !== activeViewName.value) ctx.setView(drill)
        if (!target.equals(date.value)) navigate(target, 'date')
      })
    },
    refresh() {
      store.setEvents([])
      store.setEvents(raw.value.events ?? [])
      version.value = store.version
    },
    emit,
    slots,
    slotsVersion,
    interaction: undefined as unknown as SchedulerInteraction,
    hintId: `${useId() ?? 'orb'}-hint`,
    announcement,
    announce(message) {
      // Clear first so repeating the same message is announced again.
      announcement.value = ''
      setTimeout(() => (announcement.value = message), 50)
    },
  }
  // Created after the context object because the controller reads options and emits through it.
  ctx.interaction = createInteraction(ctx as SchedulerContext<unknown>)

  provide(SchedulerContextKey, ctx as SchedulerContext<unknown>)
  return ctx
}
