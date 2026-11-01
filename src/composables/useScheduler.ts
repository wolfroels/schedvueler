import {
  computed,
  getCurrentInstance,
  getCurrentScope,
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
  type TimeWindow,
  type VisibleRange,
  weekStartForLocale,
} from '../core'
import { defaultMessages, type SchedulerOptions } from '../types'
import { createCancelable, whenAllowed } from './cancelable'
import {
  validLocale,
  validMinutes,
  validTimeZone,
  validWeekStart,
  visibleHours,
  warnOnce,
} from './validate'
import { registerDropTarget } from './externalDrag'
import { createAvailability, type SchedulerAvailability } from './useAvailability'
import { createInteraction, type SchedulerInteraction } from './useInteraction'
import { trackSlotNames } from './useSchedulerView'
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
  /** Keys of the selected events. */
  selectedEvents?: Ref<readonly string[] | undefined>
}

export interface UseSchedulerHooks {
  emit?: (name: string, payload: unknown) => void
  slots?: Slots
}

/** Field-by-field equality, comparing arrays and the messages object by their contents. */
function sameOptions<T>(a: ResolvedOptions<T>, b: ResolvedOptions<T>): boolean {
  for (const key of Object.keys(a) as (keyof ResolvedOptions<T>)[]) {
    const x = a[key]
    const y = b[key]
    if (x === y) continue
    if (key === 'hiddenDays') {
      const p = x as readonly number[]
      const q = y as readonly number[]
      if (p.length !== q.length || p.some((v, i) => v !== q[i])) return false
    } else if (key === 'messages') {
      const p = x as unknown as Record<string, unknown>
      const q = y as unknown as Record<string, unknown>
      if (Object.keys(p).some((k) => p[k] !== q[k])) return false
    } else return false
  }
  return true
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

  const timeZone = computed(() =>
    raw.value.timeZone ? validTimeZone(raw.value.timeZone, systemTimeZone) : systemTimeZone(),
  )
  const locale = computed(() =>
    raw.value.locale ? validLocale(raw.value.locale, defaultLocale) : defaultLocale(),
  )

  // Templates often pass fresh arrays and objects on every render (`:hidden-days="[6, 7]"`).
  // Keeping the previous object when nothing really changed spares every view and event from
  // recomputing and re-rendering whenever the parent re-renders.
  const resolved = computed<ResolvedOptions<T>>((old) => {
    const o = raw.value
    const layout = o.eventLayout ?? 'columns'
    const [dayStartMinute, dayEndMinute] = visibleHours(
      parseTimeOfDay(o.dayStartTime, 0),
      parseTimeOfDay(o.dayEndTime, 1440),
    )
    const next: ResolvedOptions<T> = {
      timeZone: timeZone.value,
      locale: locale.value,
      weekStart: validWeekStart(o.weekStart) ?? weekStartForLocale(locale.value),
      hiddenDays: o.hiddenDays ?? [],
      hour12: o.hour12,
      slotDuration: validMinutes(o.slotDuration, 30, 'slotDuration'),
      slotLabelInterval: validMinutes(o.slotLabelInterval, 60, 'slotLabelInterval'),
      dayStartMinute,
      dayEndMinute,
      scrollMinute: parseTimeOfDay(o.scrollTime, 480),
      eventLayout: typeof layout === 'function' ? layout : timeGridLayouts[layout],
      eventAttrs: o.eventAttrs,
      pt: o.pt,
      nowIndicator: o.nowIndicator ?? true,
      messages: { ...defaultMessages, ...o.messages },
      raw: o,
    }
    return old && sameOptions(old, next) ? old : next
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
  const queryWindow = computed<TimeWindow | undefined>(() => {
    const w = timeWindow.value
    return w && activeView.value?.definition.value.overnight
      ? { startMs: w.startMs, endMs: w.endMs + 86_400_000 }
      : w
  })
  // Occurrences straight from the store, before optimistic drag/resize results are applied.
  const queriedAll = computed(() => {
    void version.value
    return queryWindow.value ? store.query(queryWindow.value) : []
  })
  const isBackground = (occ: EventOccurrence<T>) =>
    accessors.value.display(occ.event) === 'background'
  const queried = computed(() =>
    queriedAll.value.some(isBackground)
      ? queriedAll.value.filter((o) => !isBackground(o))
      : queriedAll.value,
  )
  const backgroundOccurrences = computed(() => queriedAll.value.filter(isBackground))

  const dateLimits = computed(() => {
    const parse = (value: string | undefined) => {
      if (!value) return undefined
      try {
        return Temporal.PlainDate.from(value)
      } catch {
        warnOnce(`Invalid date "${value}" in minDate or maxDate; ignoring it.`)
        return undefined
      }
    }
    return { min: parse(raw.value.minDate), max: parse(raw.value.maxDate) }
  })

  function clampDate(value: Temporal.PlainDate): Temporal.PlainDate {
    const { min, max } = dateLimits.value
    if (min && Temporal.PlainDate.compare(value, min) < 0) return min
    if (max && Temporal.PlainDate.compare(value, max) > 0) return max
    return value
  }

  function canStep(direction: 1 | -1): boolean {
    const strategy = activeView.value?.definition.value.strategy
    if (!strategy) return false
    const { min, max } = dateLimits.value
    const target = strategy.range(strategy.step(date.value, direction))
    if (direction < 0) return !min || Temporal.PlainDate.compare(target.end, min) > 0
    return !max || Temporal.PlainDate.compare(target.start, max) <= 0
  }
  const title = computed(() =>
    range.value && activeView.value
      ? activeView.value.definition.value.title(range.value, locale.value)
      : '',
  )

  function navigate(target: Temporal.PlainDate, reason: 'prev' | 'next' | 'today' | 'date') {
    const to = clampDate(target)
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

  // Month steps clamp short months (Jan 31 to Feb 28). Remember the 31 so March is the 31st again.
  let lastStep: { date: Temporal.PlainDate; day: number } | undefined

  const step = (direction: 1 | -1) => {
    const strategy = activeView.value?.definition.value.strategy
    if (!strategy || !canStep(direction)) return
    const from = date.value
    let to = strategy.step(from, direction)
    if (strategy.keepsDayOfMonth) {
      const day = lastStep?.date.equals(from) ? lastStep.day : from.day
      to = to.with({ day: Math.min(day, to.daysInMonth) })
      lastStep = { date: to, day }
    }
    navigate(to, direction > 0 ? 'next' : 'prev')
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
  if (getCurrentInstance()) trackSlotNames(slots, slotsVersion)

  const occurrences = computed(
    () => ctx.interaction.applyPending(queried.value) as EventOccurrence<T>[],
  )
  watch(version, () => ctx.interaction.prunePending())

  const ownSelection = shallowRef<readonly string[]>([])
  const selectedEvents = computed(
    () => (state.selectedEvents ? state.selectedEvents.value : ownSelection.value) ?? [],
  )

  const announcement = shallowRef('')

  // One shared object per part: most parts have no `pt`, and some render hundreds of times.
  const plainParts = new Map<string, Record<string, unknown>>()
  function plainPart(name: string) {
    let attrs = plainParts.get(name)
    if (!attrs) plainParts.set(name, (attrs = { 'data-orb-part': name }))
    return attrs
  }

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
    backgroundOccurrences,
    availability: undefined as unknown as SchedulerAvailability,
    dateLimits,
    canStep,
    selectedEvents,
    setSelectedEvents(keys) {
      const list = selectedEvents.value
      if (keys.length === list.length && keys.every((k) => list.includes(k))) return
      if (state.selectedEvents) state.selectedEvents.value = keys
      else ownSelection.value = keys
    },
    rootEl: shallowRef(),
    eventElement: (key) =>
      ctx.rootEl.value?.querySelector<HTMLElement>(`[data-orb-key="${CSS.escape(key)}"]`) ?? null,
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
    sortViews() {
      const before = views.value
      const sorted = [...before].sort((a, b) => {
        const x = a.node()
        const y = b.node()
        if (!x || !y) return 0
        return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      })
      if (sorted.some((v, i) => v !== before[i])) views.value = sorted
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
    part(name, scope) {
      const value = resolved.value.pt?.[name]
      if (!value) return plainPart(name)
      const attrs = typeof value === 'function' ? value(scope ?? {}) : value
      return attrs ? { ...attrs, 'data-orb-part': name } : plainPart(name)
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
  // Created after the context object because they read options and emit through it.
  ctx.availability = createAvailability(ctx)
  ctx.interaction = createInteraction(ctx as SchedulerContext<unknown>)
  // Lets events dragged in from outside (v-orb-draggable) find this scheduler.
  const unregisterDropTarget = registerDropTarget(ctx.interaction)
  if (getCurrentScope()) {
    onScopeDispose(unregisterDropTarget)
    onScopeDispose(ctx.interaction.stopGesture)
  }

  provide(SchedulerContextKey, ctx as SchedulerContext<unknown>)
  return ctx
}
