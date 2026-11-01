import { computed, shallowRef, type Ref } from 'vue'
import {
  Temporal,
  defaultScopeWords,
  diffEvents,
  findConflicts,
  findFreeSlots,
  nextFreeSlot,
  recurrenceScopeOptions,
  type Conflict,
  type EventId,
  type EventOccurrence,
  type FreeSlotOptions,
  type RecurrenceEditScope,
  type ScopeWords,
} from '../core'
import type { BeforeEventChangePayload, ElementAttrs } from '../types'
import type { SchedulerContext } from './context'

/** Finds free time in a scheduler, with its events, blocked times and business hours. */
export function useAvailability<T>(ctx: SchedulerContext<T>) {
  const prepare = (options: Omit<FreeSlotOptions, 'businessHours' | 'blocked'>) => {
    const list = ctx.store
      .query({
        startMs: options.from.epochMilliseconds,
        endMs: options.to.epochMilliseconds,
      })
      .filter((o) => ctx.accessors.value.display(o.event) !== 'background')
    return {
      list,
      full: {
        ...options,
        businessHours: ctx.availability.hoursFor,
        blocked: ctx.availability.blockedTimes.value,
      },
    }
  }
  return {
    findSlots(options: Omit<FreeSlotOptions, 'businessHours' | 'blocked'>) {
      const { list, full } = prepare(options)
      return findFreeSlots(list, full)
    },
    nextFree(options: Omit<FreeSlotOptions, 'businessHours' | 'blocked' | 'limit'>) {
      const { list, full } = prepare(options)
      return nextFreeSlot(list, full)
    },
  }
}

/** Overlapping events in the visible range, per resource, and the keys of the events involved. */
export function useConflicts<T>(ctx: SchedulerContext<T>) {
  const conflicts = computed<Conflict<T>[]>(() => findConflicts(ctx.occurrences.value))
  const keys = computed(
    () => new Set(conflicts.value.flatMap((c) => c.occurrences.map((o) => o.key))),
  )
  return { conflicts, keys }
}

/** The occurrence running now or coming next, and the minutes until it starts. */
export function useNextEvent<T>(ctx: SchedulerContext<T>) {
  const next = computed(() => {
    const now = ctx.now.value.epochMilliseconds
    const upcoming = ctx.occurrences.value.filter((o) => o.startMs > now)
    return upcoming.reduce<EventOccurrence<T> | undefined>(
      (best, o) => (!best || o.startMs < best.startMs ? o : best),
      undefined,
    )
  })
  const running = computed(() => {
    const now = ctx.now.value.epochMilliseconds
    return ctx.occurrences.value.filter((o) => !o.allDay && o.startMs <= now && o.endMs > now)
  })
  const minutesUntilNext = computed(() =>
    next.value
      ? Math.ceil((next.value.startMs - ctx.now.value.epochMilliseconds) / 60_000)
      : undefined,
  )
  return { next, running, minutesUntilNext }
}

/**
 * Try changes without touching the real events: bind `visible` to the scheduler, edit `draft`,
 * and then apply or discard them all.
 */
export function useDraft<T>(events: Ref<readonly T[]>, id?: (event: T) => EventId) {
  const draft = shallowRef<readonly T[]>()
  const isActive = computed(() => draft.value !== undefined)
  const visible = computed(() => draft.value ?? events.value)
  const changes = computed(() => diffEvents(events.value, draft.value ?? events.value, id))
  const count = computed(
    () =>
      changes.value.created.length + changes.value.updated.length + changes.value.deleted.length,
  )
  const key = id ?? ((e: T) => (e as { id: EventId }).id)
  const changed = computed(
    () =>
      new Set(
        [...changes.value.created, ...changes.value.updated.map((u) => u.after)].map((e) =>
          String(key(e)),
        ),
      ),
  )
  return {
    draft,
    isActive,
    visible,
    changes,
    count,
    begin() {
      draft.value ??= events.value
    },
    /** Changes the draft, starting one when there is none. */
    set(next: readonly T[]) {
      draft.value = next
    },
    apply() {
      if (draft.value) events.value = draft.value
      draft.value = undefined
    },
    discard() {
      draft.value = undefined
    },
    /** For `event-attrs`: marks what changed as tentative. */
    attrs(occurrence: EventOccurrence<T>): ElementAttrs | undefined {
      return changed.value.has(String(occurrence.id))
        ? { class: 'orb-event--tentative' }
        : undefined
    },
  }
}

export interface CalendarLayer {
  id: string | number
  label: string
  color?: string
}

/** Sets of events that can be shown and hidden, with what `<SchedulerLegend>` needs. */
export function useCalendars<T>(
  events: Ref<readonly T[]>,
  calendars: Ref<readonly CalendarLayer[]> | readonly CalendarLayer[],
  calendarOf: (event: T) => string | number | undefined,
) {
  const list = computed(() => ('value' in calendars ? calendars.value : calendars))
  const hidden = shallowRef<ReadonlySet<string | number>>(new Set())
  const visibleEvents = computed(() => {
    if (!hidden.value.size) return events.value
    return events.value.filter((e) => {
      const id = calendarOf(e)
      return id === undefined || !hidden.value.has(id)
    })
  })
  const counts = computed(() => {
    const map = new Map<string | number, number>()
    for (const e of events.value) {
      const id = calendarOf(e)
      if (id !== undefined) map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  })
  const layers = computed(() =>
    list.value.map((c) => ({
      ...c,
      visible: !hidden.value.has(c.id),
      count: counts.value.get(c.id) ?? 0,
    })),
  )
  return {
    layers,
    hidden,
    events: visibleEvents,
    isVisible: (id: string | number) => !hidden.value.has(id),
    toggle(id: string | number, show?: boolean) {
      const next = new Set(hidden.value)
      if (show ?? next.has(id)) next.delete(id)
      else next.add(id)
      hidden.value = next
    },
  }
}

export interface SchedulerCommand {
  id: string
  label: string
  run(): void
}

/** Actions for a command palette: go to a date, switch view, find an event. The UI is yours. */
export function useCommands<T>(ctx: SchedulerContext<T>) {
  const base = computed<SchedulerCommand[]>(() => [
    { id: 'today', label: ctx.options.value.messages.today, run: ctx.goToday },
    { id: 'prev', label: ctx.options.value.messages.previous, run: ctx.prev },
    { id: 'next', label: ctx.options.value.messages.next, run: ctx.next },
    ...ctx.availableViews.value.map((v) => {
      const { name, label } = v.definition.value
      return { id: `view:${name}`, label, run: () => ctx.setView(name) }
    }),
  ])

  function search(query: string, limit = 20): SchedulerCommand[] {
    const q = query.trim().toLocaleLowerCase()
    if (!q) return base.value.slice(0, limit)
    const out = base.value.filter((c) => c.label.toLocaleLowerCase().includes(q))
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
      try {
        const date = Temporal.PlainDate.from(q)
        out.unshift({ id: `date:${q}`, label: q, run: () => ctx.goTo(date) })
      } catch {
        // Not a date after all.
      }
    }
    const title = ctx.accessors.value.title
    for (const event of ctx.store.all()) {
      if (out.length >= limit) break
      const text = title(event)
      if (!text?.toLocaleLowerCase().includes(q)) continue
      const start = ctx.store
        .query({
          startMs: ctx.date.value.subtract({ years: 1 }).toZonedDateTime(ctx.options.value.timeZone)
            .epochMilliseconds,
          endMs: ctx.date.value.add({ years: 1 }).toZonedDateTime(ctx.options.value.timeZone)
            .epochMilliseconds,
        })
        .find((o) => o.event === event)?.start
      if (!start) continue
      out.push({
        id: `event:${ctx.accessors.value.id(event)}`,
        label: text,
        run: () => ctx.goTo(start.withTimeZone(ctx.options.value.timeZone).toPlainDate()),
      })
    }
    return out.slice(0, limit)
  }

  return { commands: base, search }
}

/**
 * Asks which occurrences a change to a recurring event is for. Bind `confirm` to
 * `before-event-drop` and `before-event-resize`, show a dialog while `request` is set, and call
 * `answer` with the choice; `null` cancels the change. The dialog stays yours.
 */
export function useRecurrenceScope<T>(words: ScopeWords = defaultScopeWords) {
  const request = shallowRef<BeforeEventChangePayload<T>>()
  let resolve: ((ok: boolean) => void) | undefined
  const options = computed(() =>
    request.value ? recurrenceScopeOptions(request.value.occurrence, words) : [],
  )
  return {
    request,
    options,
    confirm(payload: BeforeEventChangePayload<T>) {
      if (!payload.recurring) return
      request.value = payload
      payload.waitUntil(new Promise<boolean>((r) => (resolve = r)))
    },
    answer(scope: RecurrenceEditScope | null) {
      const payload = request.value
      request.value = undefined
      if (payload && scope) payload.scope = scope
      resolve?.(scope !== null)
      resolve = undefined
    },
  }
}
