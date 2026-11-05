import { ownerWindow } from './usePictureInPicture'
import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import {
  Temporal,
  computeDrop,
  computeMove,
  computeResize,
  computeSelection,
  findBlocked,
  findOverlaps,
  fitsBusinessHours,
  formatDate,
  formatTimeRange,
  daysBetween,
  rangeContains,
  sameTimes,
  shiftResourceIds,
  withTimes,
  type EventOccurrence,
  type EventTimes,
  type Hit,
  type RefusalReason,
  type ResourceId,
} from '../core'
import type {
  DurationLimits,
  EventChangeKind,
  ExternalEventTemplate,
  SelectPayload,
} from '../types'
import { createCancelable } from './cancelable'
import { otherDropTargets, takeArmedTemplate } from './externalDrag'
import { parseTimeOfDay, type SchedulerContext } from './context'

/** A rendered area that can tell what is under the pointer (a time grid, a month grid, ...). */
export interface DragSurface {
  hitTest(clientX: number, clientY: number): Hit | null
  /** Scroll container to auto-scroll near its edges while dragging. */
  scrollElement?: () => HTMLElement | null | undefined
  /** The part of it not covered by sticky headers. Defaults to the whole element. */
  scrollArea?: () => { left: number; top: number; right: number; bottom: number } | undefined
  /** Minutes to snap gestures that start on this surface to. Defaults to the scheduler's. */
  snapMinutes?: () => number
  /** Wall-clock minute that snap steps on this surface count from. Defaults to midnight. */
  snapOrigin?: () => number
  /** Scrolls to a wall-clock minute. */
  scrollToMinute?: (minute: number) => void
}

/** A keyboard move or resize step. */
export interface KeyboardStep {
  days?: number
  minutes?: number
  /** Step along a timeline: all-day events then move by whole days of minutes. */
  timeline?: boolean
  /** Resource the event is shown on, and the one to move it to. */
  fromResource?: ResourceId
  toResource?: ResourceId
  snapMinutes?: number
}

export interface DragState {
  /** `receive`: an event dragged in from outside the scheduler. */
  kind: EventChangeKind | 'select' | 'receive'
  view: string
  occurrence: EventOccurrence<unknown> | undefined
  origin: Hit
  preview: EventTimes | null
  valid: boolean
  /** Why the current spot is refused. */
  reason: RefusalReason | null
  /** Other selected events and where they would land. */
  group?: readonly { occurrence: EventOccurrence<unknown>; times: EventTimes }[]
}

export interface Selection {
  view: string
  times: EventTimes
}

interface PendingChange {
  occurrence: EventOccurrence<unknown>
  event: unknown
  times: EventTimes
}

export interface SchedulerInteraction {
  /** Active drag, resize or selection gesture. */
  state: Readonly<ShallowRef<DragState | null>>
  /** Preview of the dragged occurrence, keyed `<key>::mirror`. */
  mirror: ComputedRef<(EventOccurrence<unknown> & { valid: boolean; sourceKey: string }) | null>
  /** Current selection, or the range being selected. */
  selection: ComputedRef<(Selection & { pending: boolean }) | null>
  /**
   * Applies optimistic changes to queried occurrences.
   * @internal
   */
  applyPending<T>(occurrences: EventOccurrence<T>[]): EventOccurrence<T>[]
  canDrag(occurrence: EventOccurrence<unknown>): boolean
  canResize(occurrence: EventOccurrence<unknown>): boolean
  readonly selectable: boolean
  registerSurface(surface: DragSurface): () => void
  /** Pointerdown on an event or one of its resize handles. */
  pointerDownOnEvent(
    e: PointerEvent,
    occurrence: EventOccurrence<unknown>,
    kind: EventChangeKind,
    view: string,
    /** Date the gesture counts from, when the event is not drawn on its date (a popover's list). */
    originDate?: Temporal.PlainDate,
  ): void
  /** Pointerdown on an empty slot or day cell. */
  pointerDownOnSlot(e: PointerEvent, view: string): void
  /** Keyboard move/resize of a focused event. */
  keyboardChange(
    e: KeyboardEvent,
    occurrence: EventOccurrence<unknown>,
    kind: EventChangeKind,
    view: string,
    step: KeyboardStep,
  ): void
  /** Sets the selection from the keyboard; `commit` emits `select`. */
  setSelection(view: string, times: EventTimes | null, commit?: KeyboardEvent): void
  clearSelection(): void
  /**
   * Drops optimistic changes whose events were replaced (called when events change).
   * @internal
   */
  prunePending(): void
  /** Ends a gesture in progress, e.g. when the scheduler goes away. */
  stopGesture(): void
  /**
   * Ends a gesture whose event was deleted, e.g. by someone else while dragging.
   * @internal
   */
  stopIfDeleted(): void
  /**
   * Whether a newly shown event should take the focus, after a keyboard change re-created it.
   * @internal
   */
  claimFocus(occurrence: EventOccurrence<unknown>): boolean

  // --- events dragged in from outside (see `startExternalDrag`) ---
  /** Shows the preview for an outside event at (x, y); returns whether it is over this scheduler. */
  receiveMove(template: ExternalEventTemplate, x: number, y: number): boolean
  /** Removes the preview of an outside event. */
  receiveLeave(): void
  /** Drops the outside event where the preview is: emits `before-event-receive` and `event-receive`. */
  receiveDrop(nativeEvent: PointerEvent | KeyboardEvent): void
  /** Puts a template picked up from the keyboard down at `hit`; false when none is picked up. */
  dropArmed(hit: Hit, nativeEvent: KeyboardEvent): boolean
  /** Native drops (files, other windows): shows where it would land. */
  nativeDragOver(e: DragEvent): void
  nativeDragLeave(): void
  /** Native drops: emits `native-drop` where the preview is. */
  nativeDrop(e: DragEvent): void

  // --- selected events ---
  /** Handles a click on an event when `eventSelection` is on. */
  selectEvent(occurrence: EventOccurrence<unknown>, e: MouseEvent | KeyboardEvent): void
  /** Other selected events, to change along with `occurrence`. */
  groupOf(occurrence: EventOccurrence<unknown>): EventOccurrence<unknown>[]
  /** The rectangle being drawn around events, in viewport pixels. */
  marquee: Readonly<ShallowRef<{ left: number; top: number; width: number; height: number } | null>>

  // --- moving without dragging ---
  /** The next click on a slot or day moves or resizes this event. `null` cancels. */
  armMove(occurrence: EventOccurrence<unknown> | null, kind?: EventChangeKind): void
  /** The event waiting for that click. */
  armed: Readonly<
    ShallowRef<{ occurrence: EventOccurrence<unknown>; kind: EventChangeKind } | null>
  >
  /** Places the armed event at `hit`; false when none is armed. */
  placeArmed(hit: Hit, nativeEvent: MouseEvent, snapMinutes?: number): boolean

  // --- clipboard ---
  copy(cut: boolean): boolean
  paste(nativeEvent: KeyboardEvent): boolean
  /** Where a paste lands: the slot or day that has the focus. */
  setCursor(hit: Hit): void
  /** Scrolls a view when (x, y) is near its edge; returns whether it scrolled. */
  scrollNear(x: number, y: number): boolean
  /** Where the pointer is during a gesture, in viewport pixels. */
  pointer: Readonly<ShallowRef<{ x: number; y: number } | null>>
  /** Scrolls the active view to a wall-clock minute. */
  scrollToMinute(minute: number): void
  /** Why these times would be refused, or `null`. Runs every rule, for your own checks too. */
  refusal(
    kind: DragState['kind'],
    occurrence: EventOccurrence<unknown> | undefined,
    times: EventTimes,
  ): RefusalReason | null
}

const EXTERNAL_KEY = '__orb-external'

const DRAG_THRESHOLD = 4
const EDGE = 48

export function createInteraction(ctx: SchedulerContext<unknown>): SchedulerInteraction {
  /** The window the scheduler is in, which is the picture-in-picture one while popped out. */
  const host = () => ownerWindow(ctx.rootEl.value)
  const state = shallowRef<DragState | null>(null)
  const committedSelection = shallowRef<Selection | null>(null)
  const pending = shallowRef(new Map<string, PendingChange>())
  const surfaces = new Set<DragSurface>()
  let endGesture: (() => void) | undefined

  const raw = () => ctx.options.value.raw
  const snapMinutes = () => raw().snapDuration ?? ctx.options.value.slotDuration
  const computeOptions = (snap = snapMinutes()) => ({
    timeZone: ctx.options.value.timeZone,
    snapMinutes: snap,
    defaultDurationMinutes: raw().defaultEventDuration ?? 60,
  })

  const mirror = computed(() => {
    const s = state.value
    if (!s || !s.occurrence || !s.preview) return null
    // withTimes() returns a frozen object, so extend a copy.
    return Object.freeze({
      ...withTimes(s.occurrence, s.preview, `${s.occurrence.key}::mirror`),
      valid: s.valid,
      sourceKey: s.occurrence.key,
    })
  })

  const selection = computed(() => {
    const s = state.value
    if (s?.kind === 'select')
      return s.preview ? { view: s.view, times: s.preview, pending: true } : null
    return committedSelection.value ? { ...committedSelection.value, pending: false } : null
  })

  function hit(x: number, y: number): { hit: Hit; surface: DragSurface } | null {
    for (const surface of surfaces) {
      const h = surface.hitTest(x, y)
      if (h) return { hit: h, surface }
    }
    return null
  }

  function canDrag(occ: EventOccurrence<unknown>): boolean {
    const o = raw()
    const a = ctx.accessors.value
    const own = a.draggable(occ.event) ?? a.editable(occ.event)
    if (!(own ?? o.eventDraggable ?? o.editable ?? false)) return false
    return o.canDrag ? o.canDrag(occ) : true
  }

  function canResize(occ: EventOccurrence<unknown>): boolean {
    const o = raw()
    const a = ctx.accessors.value
    const own = a.resizable(occ.event) ?? a.editable(occ.event)
    if (!(own ?? o.eventResizable ?? o.editable ?? false)) return false
    return o.canResize ? o.canResize(occ) : true
  }

  function isValid(
    kind: DragState['kind'],
    occ: EventOccurrence<unknown> | undefined,
    times: EventTimes,
  ) {
    const o = raw()
    if (kind === 'select') return o.canSelect ? o.canSelect(selectInfo(times)) : true
    if (kind === 'receive') return true
    return o.canDrop && occ
      ? o.canDrop({
          occurrence: occ,
          kind,
          ...times,
          resourceIds: times.resourceIds ?? occ.resourceIds,
        })
      : true
  }

  function refusal(
    kind: DragState['kind'],
    occ: EventOccurrence<unknown> | undefined,
    times: EventTimes,
  ): RefusalReason | null {
    const o = raw()
    const { timeZone } = ctx.options.value
    const startMs = times.start.epochMilliseconds
    const endMs = times.end.epochMilliseconds
    const resourceIds = times.resourceIds ?? occ?.resourceIds ?? []

    const { min, max } = ctx.dateLimits.value
    const first = times.start.withTimeZone(timeZone).toPlainDate()
    const last = times.end.withTimeZone(timeZone).subtract({ nanoseconds: 1 }).toPlainDate()
    if (min && Temporal.PlainDate.compare(first, min) < 0) return 'date-limit'
    if (max && Temporal.PlainDate.compare(last, max) > 0) return 'date-limit'

    if (findBlocked(ctx.availability.blockedTimes.value, startMs, endMs, resourceIds))
      return 'blocked'
    if (o.isSlotDisabled?.({ ...selectInfo(times), resourceId: resourceIds[0] })) return 'disabled'

    if (o.businessHoursOnly && !times.allDay) {
      const zoned = (value: Temporal.ZonedDateTime) => value.withTimeZone(timeZone)
      const targets: readonly (ResourceId | undefined)[] = resourceIds.length
        ? resourceIds
        : [undefined]
      for (const id of targets) {
        const hours = ctx.availability.hoursFor(id)
        if (hours && !fitsBusinessHours(zoned(times.start), zoned(times.end), hours))
          return 'business-hours'
      }
    }

    // Moves keep their length, so only what changes it is checked.
    if (kind !== 'move' && kind !== 'receive' && o.durationLimits) {
      const limits: DurationLimits =
        typeof o.durationLimits === 'function' ? o.durationLimits(occ) : o.durationLimits
      const minutes = (endMs - startMs) / 60_000
      if (limits.min !== undefined && minutes < limits.min) return 'duration'
      if (limits.max !== undefined && minutes > limits.max) return 'duration'
    }

    const overlap = o.eventOverlap ?? 'allow'
    if (overlap !== 'allow') {
      const a = ctx.accessors.value
      const padding = (o: EventOccurrence<unknown>) => (a.bufferBefore(o.event) ?? 0) * 60_000
      const paddingAfter = (o: EventOccurrence<unknown>) => (a.bufferAfter(o.event) ?? 0) * 60_000
      // A day of room on each side finds neighbours whose buffers reach this far.
      const reach = 86_400_000
      const own = occ ? { before: padding(occ), after: paddingAfter(occ) } : { before: 0, after: 0 }
      const from = startMs - own.before
      const to = endMs + own.after
      const others = findOverlaps(
        ctx.store
          .query({ startMs: from - reach, endMs: to + reach })
          .filter((x) => a.display(x.event) !== 'background'),
        -Infinity,
        Infinity,
        resourceIds,
        occ?.key,
      ).filter((x) => x.startMs - padding(x) < to && x.endMs + paddingAfter(x) > from)
      const allowed =
        overlap === 'forbid'
          ? !others.length
          : others.every((other) =>
              overlap({ occurrence: occ, other, start: times.start, end: times.end }),
            )
      if (!allowed) return 'overlap'
    }
    return isValid(kind, occ, times) ? null : 'custom'
  }

  function reportRefused(
    occ: EventOccurrence<unknown>,
    kind: EventChangeKind,
    view: string,
    times: EventTimes,
    reason: RefusalReason,
  ) {
    ctx.emit('event-change-failed', {
      ...base(occ, view, kind),
      reason,
      ...times,
      resourceIds: times.resourceIds ?? occ.resourceIds,
    })
    ctx.announce(ctx.options.value.messages.dragCancelled)
  }

  function selectInfo(times: EventTimes) {
    return {
      start: times.start,
      end: times.end,
      allDay: times.allDay,
      resourceId: times.resourceIds?.[0],
    }
  }

  function describe(times: EventTimes): string {
    const { locale, hour12 } = ctx.options.value
    const date = formatDate(times.start.toPlainDate(), locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    return times.allDay
      ? date
      : `${date}, ${formatTimeRange(times.start, times.end, locale, { hour12 })}`
  }

  // --- selected events ---------------------------------------------------------------------------

  const pointer = shallowRef<{ x: number; y: number } | null>(null)
  const timedLengths = new Map<string, number>()
  const marquee = shallowRef<{ left: number; top: number; width: number; height: number } | null>(
    null,
  )
  let selectionAnchorKey: string | undefined

  function setSelected(keys: readonly string[]) {
    ctx.setSelectedEvents(keys)
  }

  function selectEvent(occ: EventOccurrence<unknown>, e: MouseEvent | KeyboardEvent) {
    const selected = ctx.selectedEvents.value
    if (e.shiftKey && selectionAnchorKey) {
      const list = ctx.occurrences.value
      const a = list.findIndex((o) => o.key === selectionAnchorKey)
      const b = list.findIndex((o) => o.key === occ.key)
      if (a >= 0 && b >= 0) {
        setSelected(list.slice(Math.min(a, b), Math.max(a, b) + 1).map((o) => o.key))
        return
      }
    }
    selectionAnchorKey = occ.key
    if (e.ctrlKey || e.metaKey) {
      setSelected(
        selected.includes(occ.key) ? selected.filter((k) => k !== occ.key) : [...selected, occ.key],
      )
    } else setSelected([occ.key])
  }

  function groupOf(occ: EventOccurrence<unknown>): EventOccurrence<unknown>[] {
    const selected = ctx.selectedEvents.value
    if (selected.length < 2 || !selected.includes(occ.key)) return []
    return ctx.occurrences.value.filter((o) => o.key !== occ.key && selected.includes(o.key))
  }

  /** Where another selected event lands when `occ` gets `times`: by the same wall-clock shift. */
  function groupTimes(
    other: EventOccurrence<unknown>,
    occ: EventOccurrence<unknown>,
    kind: EventChangeKind,
    times: EventTimes,
  ): EventTimes | null {
    if (other.allDay !== occ.allDay || times.allDay !== occ.allDay) return null
    const startDelta = times.start.epochMilliseconds - occ.startMs
    const endDelta = times.end.epochMilliseconds - occ.endMs
    const start =
      kind === 'resize-end' ? other.start : other.start.add({ milliseconds: startDelta })
    const end = kind === 'resize-start' ? other.end : other.end.add({ milliseconds: endDelta })
    if (end.epochMilliseconds <= start.epochMilliseconds) return null
    return { start, end, allDay: other.allDay, resourceIds: other.resourceIds }
  }

  function startMarquee(e: PointerEvent) {
    const win = host()
    const x0 = e.clientX
    const y0 = e.clientY
    const before = e.ctrlKey || e.metaKey ? ctx.selectedEvents.value : []
    const onMove = (ev: PointerEvent) => {
      const left = Math.min(x0, ev.clientX)
      const top = Math.min(y0, ev.clientY)
      const width = Math.abs(ev.clientX - x0)
      const height = Math.abs(ev.clientY - y0)
      if (width < DRAG_THRESHOLD && height < DRAG_THRESHOLD) return
      marquee.value = { left, top, width, height }
      const inside: string[] = []
      ctx.rootEl.value?.querySelectorAll<HTMLElement>('[data-orb-key]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.left < left + width && r.right > left && r.top < top + height && r.bottom > top)
          inside.push(el.dataset.orbKey!)
      })
      setSelected([...new Set([...before, ...inside])])
    }
    const onUp = () => {
      win.removeEventListener('pointermove', onMove)
      win.removeEventListener('pointerup', onUp)
      if (!marquee.value) return
      marquee.value = null
      const swallow = (click: Event) => click.stopPropagation()
      win.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => win.removeEventListener('click', swallow, true), 0)
    }
    win.addEventListener('pointermove', onMove)
    win.addEventListener('pointerup', onUp)
  }

  // --- moving without dragging --------------------------------------------------------------------

  const armed = shallowRef<{ occurrence: EventOccurrence<unknown>; kind: EventChangeKind } | null>(
    null,
  )

  function armMove(occ: EventOccurrence<unknown> | null, kind: EventChangeKind = 'move') {
    armed.value = occ ? { occurrence: occ, kind } : null
    if (occ)
      ctx.announce(ctx.options.value.messages.moveArmed(ctx.accessors.value.title(occ.event) ?? ''))
  }

  function placeArmed(at: Hit, nativeEvent: MouseEvent, snap = snapMinutes()): boolean {
    const a = armed.value
    if (!a) return false
    armed.value = null
    const { occurrence: occ, kind } = a
    const { timeZone } = ctx.options.value
    const opts = {
      ...computeOptions(snap),
      ...(timedLengths.has(occ.key) ? { defaultDurationMinutes: timedLengths.get(occ.key)! } : {}),
    }
    const edgeValue = kind === 'resize-end' ? occ.end : occ.start
    const edge = edgeValue.withTimeZone(timeZone)
    const last = occ.allDay && kind === 'resize-end' ? edge.subtract({ days: 1 }) : edge
    const resourceId = at.resourceId === undefined ? undefined : occ.resourceIds[0]
    const origin: Hit =
      at.zone === 'time' || at.zone === 'timeline'
        ? {
            zone: at.zone,
            date: edge.toPlainDate(),
            minute: edge.hour * 60 + edge.minute,
            resourceId,
          }
        : { zone: at.zone, date: last.toPlainDate(), resourceId }
    // Resizing the end to a slot includes that slot.
    const target: Hit =
      kind === 'resize-end' && 'minute' in at ? { ...at, minute: at.minute + snap } : at
    const times =
      kind === 'move'
        ? computeMove(occ, origin, target, opts)
        : computeResize(occ, kind === 'resize-start' ? 'start' : 'end', origin, target, opts)
    if (!times || sameTimes(times, occ)) return true
    const reason = refusal(kind, occ, times)
    if (reason) reportRefused(occ, kind, ctx.activeViewName.value ?? '', times, reason)
    else commit(occ, kind, ctx.activeViewName.value ?? '', times, nativeEvent as PointerEvent)
    return true
  }

  // --- clipboard ---------------------------------------------------------------------------------

  let clipboard: { occurrences: EventOccurrence<unknown>[]; cut: boolean } | null = null
  let cursor: Hit | null = null

  function clipboardTargets(): EventOccurrence<unknown>[] {
    const selected = ctx.selectedEvents.value
    if (selected.length) return ctx.occurrences.value.filter((o) => selected.includes(o.key))
    const key = (host().document.activeElement as HTMLElement | null)?.dataset?.orbKey
    return ctx.occurrences.value.filter((o) => o.key === key)
  }

  function copy(cut: boolean): boolean {
    const occurrences = clipboardTargets()
    if (!occurrences.length) return false
    clipboard = { occurrences, cut }
    ctx.emit('events-copy', { occurrences, cut })
    return true
  }

  function paste(nativeEvent: KeyboardEvent): boolean {
    if (!clipboard?.occurrences.length) return false
    const { timeZone } = ctx.options.value
    const { occurrences, cut } = clipboard
    const first = occurrences.reduce((a, b) => (b.startMs < a.startMs ? b : a))
    const firstStart = first.start.withTimeZone(timeZone)
    const date = cursor?.date ?? ctx.date.value
    const minute =
      cursor && 'minute' in cursor ? cursor.minute : firstStart.hour * 60 + firstStart.minute
    // Whole days and minutes, so that wall-clock times stay right across DST.
    const shift =
      daysBetween(firstStart.toPlainDate(), date) * 1440 +
      (first.allDay ? 0 : minute - (firstStart.hour * 60 + firstStart.minute))
    const items = occurrences.map((occurrence) => {
      const move = (value: Temporal.ZonedDateTime) =>
        value
          .withTimeZone(timeZone)
          .toPlainDateTime()
          .add({ minutes: shift })
          .toZonedDateTime(timeZone)
      const resourceIds =
        cursor?.resourceId !== undefined ? [cursor.resourceId] : occurrence.resourceIds
      return {
        occurrence,
        event: occurrence.event,
        start: move(occurrence.start),
        end: move(occurrence.end),
        allDay: occurrence.allDay,
        resourceIds,
      }
    })
    ctx.emit('events-paste', { items, cut, nativeEvent, view: ctx.activeViewName.value ?? '' })
    if (cut) clipboard = null
    return true
  }

  function base(occ: EventOccurrence<unknown>, view: string, kind: EventChangeKind) {
    return { occurrence: occ, event: occ.event, view, kind }
  }

  // --- committing changes ----------------------------------------------------------------------

  function commit(
    occ: EventOccurrence<unknown>,
    kind: EventChangeKind,
    view: string,
    times: EventTimes,
    nativeEvent: PointerEvent | KeyboardEvent,
    group: readonly { occurrence: EventOccurrence<unknown>; times: EventTimes }[] = [],
  ) {
    // An all-day event dragged back into the grid gets the length it had.
    if (!occ.allDay && times.allDay) timedLengths.set(occ.key, (occ.endMs - occ.startMs) / 60_000)
    else if (occ.allDay && !times.allDay) timedLengths.delete(occ.key)
    const scope = raw().recurrenceEditScope ?? 'this'
    const before = kind === 'move' ? 'before-event-drop' : 'before-event-resize'
    const after = kind === 'move' ? 'event-drop' : 'event-resize'
    const { payload, settle } = createCancelable({
      ...base(occ, view, kind),
      oldStart: occ.start,
      oldEnd: occ.end,
      oldAllDay: occ.allDay,
      oldResourceIds: occ.resourceIds,
      ...times,
      resourceIds: times.resourceIds ?? occ.resourceIds,
      recurring: occ.recurring || occ.isException,
      scope,
      nativeEvent,
      others: group.map((g) => ({
        occurrence: g.occurrence,
        ...g.times,
        resourceIds: g.times.resourceIds ?? g.occurrence.resourceIds,
      })),
      getElement: () => ctx.eventElement(occ.key),
    })

    // Show the new position right away; it stays until `events` changes or the change is reverted.
    const revert = () => {
      if (pending.value.get(occ.key)?.times !== times) return
      const next = new Map(pending.value)
      next.delete(occ.key)
      for (const g of group) next.delete(g.occurrence.key)
      pending.value = next
    }
    const optimistic = new Map(pending.value).set(occ.key, {
      occurrence: occ,
      event: occ.event,
      times,
    })
    for (const g of group) {
      optimistic.set(g.occurrence.key, {
        occurrence: g.occurrence,
        event: g.occurrence.event,
        times: g.times,
      })
    }
    pending.value = optimistic

    ctx.emit(before, payload)
    const done = (ok: boolean) => {
      if (!ok) {
        revert()
        ctx.emit('event-drag-cancel', { ...base(occ, view, kind), reason: 'prevented' })
        ctx.announce(ctx.options.value.messages.dragCancelled)
        return
      }
      const { preventDefault: _p, waitUntil: _w, ...rest } = payload
      ctx.emit(after, { ...rest, scope: payload.scope, revert })
      const title = ctx.accessors.value.title(occ.event) ?? ''
      ctx.announce(ctx.options.value.messages.eventChanged(title, describe(times)))
    }
    const result = settle()
    if (typeof result === 'boolean') done(result)
    else void result.then(done)
  }

  function emitSelect(view: string, times: EventTimes, nativeEvent: PointerEvent | KeyboardEvent) {
    committedSelection.value = { view, times }
    const payload: SelectPayload = {
      view,
      ...selectInfo(times),
      nativeEvent,
      getElement: () =>
        ctx.rootEl.value?.querySelector<HTMLElement>('[data-orb-part="selection"]') ?? null,
    }
    ctx.emit('select', payload)
    ctx.announce(ctx.options.value.messages.selected(describe(times)))
  }

  function clearSelection() {
    if (!committedSelection.value) return
    committedSelection.value = null
    ctx.emit('unselect', undefined)
  }

  /** Whether (x, y) is over a view, including parts of it where nothing can be dropped. */
  function overSurface(x: number, y: number): boolean {
    for (const surface of surfaces) {
      const el = surface.scrollElement?.()
      if (!el) return true
      const rect = el.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true
    }
    return false
  }

  // --- keeping the focus on an event that a keyboard change re-creates -----------------------------

  let focusRequest: { key: string; times: EventTimes; title: unknown } | null = null
  let focusTimer: ReturnType<typeof setTimeout> | undefined

  function requestFocus(occ: EventOccurrence<unknown>, times: EventTimes) {
    focusRequest = { key: occ.key, times, title: ctx.accessors.value.title(occ.event) }
    clearTimeout(focusTimer)
    // Long enough for the host to update its events; an event appearing later is not this one.
    focusTimer = setTimeout(() => (focusRequest = null), 1000)
  }

  function claimFocus(occ: EventOccurrence<unknown>): boolean {
    const f = focusRequest
    if (!f) return false
    // Saving can give the occurrence another key, e.g. when it becomes an exception.
    const same =
      occ.key === f.key ||
      (occ.startMs === f.times.start.epochMilliseconds &&
        occ.endMs === f.times.end.epochMilliseconds &&
        ctx.accessors.value.title(occ.event) === f.title)
    if (same) focusRequest = null
    return same
  }

  function scrollNear(x: number, y: number): boolean {
    const edgeSpeed = (pos: number, start: number, end: number) =>
      pos < start + EDGE ? -(start + EDGE - pos) / 3 : pos > end - EDGE ? (pos - end + EDGE) / 3 : 0
    let scrolled = false
    for (const surface of surfaces) {
      const el = surface.scrollElement?.()
      if (!el) continue
      const rect = surface.scrollArea?.() ?? el.getBoundingClientRect()
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
      const dy = edgeSpeed(y, rect.top, rect.bottom)
      const dx = el.scrollWidth > el.clientWidth ? edgeSpeed(x, rect.left, rect.right) : 0
      if (dx || dy) {
        el.scrollTop += dy
        el.scrollLeft += dx
        scrolled = true
      }
    }
    return scrolled
  }

  // --- events dragged in from outside ----------------------------------------------------------

  let receiving: ExternalEventTemplate | null = null

  function receiveInfo(times: EventTimes) {
    return {
      start: times.start,
      end: times.end,
      allDay: times.allDay,
      resourceIds: times.resourceIds ?? [],
      resourceId: times.resourceIds?.[0],
    }
  }

  /** A stand-in occurrence so the views can draw the preview like any other drag. */
  function externalOccurrence(template: ExternalEventTemplate, times: EventTimes) {
    const event = template.event ?? {
      id: EXTERNAL_KEY,
      title: template.title,
      color: template.color,
    }
    return withTimes(
      {
        key: EXTERNAL_KEY,
        id: EXTERNAL_KEY,
        event,
        recurring: false,
        isException: false,
      } as unknown as EventOccurrence<unknown>,
      times,
    )
  }

  function receiveMove(template: ExternalEventTemplate, x: number, y: number): boolean {
    const found = hit(x, y)
    if (!found) {
      receiveLeave()
      return false
    }
    receiveAt(template, found.hit, found.surface.snapMinutes?.() ?? snapMinutes())
    return true
  }

  function dropArmed(at: Hit, nativeEvent: KeyboardEvent): boolean {
    const template = takeArmedTemplate()
    if (!template) return false
    receiveAt(template, at, snapMinutes())
    receiveDrop(nativeEvent)
    return true
  }

  const NATIVE_TEMPLATE: ExternalEventTemplate = {}

  function nativeDragOver(e: DragEvent) {
    if (!raw().nativeDrop) return
    if (receiveMove(NATIVE_TEMPLATE, e.clientX, e.clientY)) e.preventDefault()
  }

  function nativeDragLeave() {
    receiveLeave()
  }

  function nativeDrop(e: DragEvent) {
    const s = state.value
    if (!raw().nativeDrop || s?.kind !== 'receive' || !s.preview) return
    e.preventDefault()
    state.value = null
    receiving = null
    if (!s.valid) return
    ctx.emit('native-drop', {
      view: s.view,
      ...receiveInfo(s.preview),
      dataTransfer: e.dataTransfer,
      nativeEvent: e,
    })
  }

  function receiveAt(template: ExternalEventTemplate, at: Hit, snap: number) {
    receiving = template
    const opts = computeOptions(snap)
    const preview = computeDrop(
      at,
      {
        allDay: template.allDay,
        durationMinutes: template.duration,
        days: template.days,
        startMinute: template.startTime ? parseTimeOfDay(template.startTime, 540) : undefined,
      },
      opts,
    )
    const s = state.value
    if (s?.kind === 'receive' && sameTimes(preview, s.preview)) return
    const canReceive = raw().canReceive
    const reason =
      refusal('receive', undefined, preview) ??
      (canReceive && !canReceive({ ...receiveInfo(preview), template }) ? 'custom' : null)
    state.value = {
      kind: 'receive',
      view: ctx.activeViewName.value ?? '',
      occurrence: externalOccurrence(template, preview),
      origin: at,
      preview,
      valid: !reason,
      reason,
    }
  }

  function receiveLeave() {
    if (state.value?.kind === 'receive') state.value = null
  }

  function receiveDrop(nativeEvent: PointerEvent | KeyboardEvent) {
    const s = state.value
    const template = receiving
    receiving = null
    if (s?.kind !== 'receive' || !s.preview || !template) return
    state.value = null
    if (!s.valid) {
      ctx.announce(ctx.options.value.messages.dragCancelled)
      return
    }
    const times = s.preview
    const { payload, settle } = createCancelable({
      view: s.view,
      ...receiveInfo(times),
      template,
      data: template.data,
      nativeEvent,
    })
    ctx.emit('before-event-receive', payload)
    const done = (ok: boolean) => {
      if (!ok) {
        ctx.announce(ctx.options.value.messages.dragCancelled)
        return
      }
      const { preventDefault: _p, waitUntil: _w, defaultPrevented: _d, ...rest } = payload
      ctx.emit('event-receive', rest)
      ctx.announce(ctx.options.value.messages.eventChanged(template.title ?? '', describe(times)))
    }
    const result = settle()
    if (typeof result === 'boolean') done(result)
    else void result.then(done)
  }

  // --- pointer gestures ------------------------------------------------------------------------

  function startGesture(
    e: PointerEvent,
    kind: EventChangeKind | 'select',
    view: string,
    occ: EventOccurrence<unknown> | undefined,
    originDate?: Temporal.PlainDate,
  ) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const win = host()
    const others = occ && kind !== 'select' ? groupOf(occ) : []
    let leaveTarget: SchedulerInteraction | null = null
    const leaveTemplate = (): ExternalEventTemplate => ({
      title: ctx.accessors.value.title(occ!.event),
      color: ctx.accessors.value.color(occ!.event),
      event: occ!.event,
      data: occ!.event,
      allDay: occ!.allDay,
      duration: (occ!.endMs - occ!.startMs) / 60_000,
      days: occ!.allDay ? Math.round((occ!.endMs - occ!.startMs) / 86_400_000) : undefined,
    })
    const found = hit(e.clientX, e.clientY)
    if (!found) return
    const origin = originDate ? { ...found.hit, date: originDate } : found.hit
    const opts = {
      ...computeOptions(found.surface.snapMinutes?.() ?? snapMinutes()),
      snapOrigin: found.surface.snapOrigin?.() ?? 0,
      ...(occ && timedLengths.has(occ.key)
        ? { defaultDurationMinutes: timedLengths.get(occ.key)! }
        : {}),
    }

    const touch = e.pointerType !== 'mouse'
    const pointerId = e.pointerId
    const startX = e.clientX
    const startY = e.clientY
    let lastX = startX
    let lastY = startY
    let active = false
    let outside = false
    let longPress: ReturnType<typeof setTimeout> | undefined
    let frame = 0

    const cleanup = () => {
      endGesture = undefined
      clearTimeout(longPress)
      cancelAnimationFrame(frame)
      win.removeEventListener('pointermove', onMove)
      win.removeEventListener('pointerup', onUp)
      win.removeEventListener('pointercancel', onCancel)
      win.removeEventListener('keydown', onKey, true)
      win.removeEventListener('touchmove', blockScroll)
      win.document.documentElement.classList.remove('orb-dragging')
    }

    const activate = (nativeEvent: PointerEvent) => {
      if (occ && kind !== 'select') {
        const { payload, settle } = createCancelable({ ...base(occ, view, kind), nativeEvent })
        ctx.emit('event-drag-start', payload)
        if (settle() !== true) return cleanup()
      }
      active = true
      state.value = {
        kind,
        view,
        occurrence: occ,
        origin,
        preview: null,
        valid: true,
        reason: null,
      }
      win.document.documentElement.classList.add('orb-dragging')
      if (touch) navigator.vibrate?.(10)
      update(lastX, lastY)
      autoScroll()
    }

    const update = (x: number, y: number) => {
      const s = state.value
      if (!s) return
      pointer.value = { x, y }
      // Moving an event off the scheduler takes the preview away: letting go there cancels.
      outside = kind === 'move' && !overSurface(x, y)
      if (outside) {
        if (s.preview) state.value = { ...s, preview: null, group: undefined }
        leaveTarget = null
        if (raw().eventLeave) {
          for (const other of otherDropTargets(self)) {
            if (!leaveTarget && other.receiveMove(leaveTemplate(), x, y)) leaveTarget = other
            else other.receiveLeave()
          }
        }
        return
      }
      for (const other of otherDropTargets(self)) other.receiveLeave()
      leaveTarget = null
      const current = hit(x, y)?.hit
      if (!current) return
      let preview: EventTimes | null
      if (kind === 'select') preview = computeSelection(origin, current, opts)
      else if (kind === 'move') {
        preview = computeMove(occ!, origin, current, opts)
        if (raw().multiResourceDrag === 'all' && occ!.resourceIds.length > 1) {
          preview = {
            ...preview,
            resourceIds: shiftResourceIds(
              occ!.resourceIds,
              origin.resourceId,
              current.resourceId,
              ctx.visibleResources.value.map((r) => r.id),
            ),
          }
        }
      } else
        preview = computeResize(
          occ!,
          kind === 'resize-start' ? 'start' : 'end',
          origin,
          current,
          opts,
        )
      if (!preview || sameTimes(preview, s.preview)) return
      let reason = refusal(kind, occ, preview)
      const group: { occurrence: EventOccurrence<unknown>; times: EventTimes }[] = []
      if (occ && kind !== 'select') {
        for (const other of others) {
          const times = groupTimes(other, occ, kind, preview)
          if (!times) continue
          reason ??= refusal(kind, other, times)
          group.push({ occurrence: other, times })
        }
      }
      const valid = !reason
      state.value = { ...s, preview, valid, reason, group: group.length ? group : undefined }
      if (occ && kind !== 'select')
        ctx.emit('event-drag', {
          ...base(occ, view, kind),
          ...preview,
          resourceIds: preview.resourceIds ?? occ.resourceIds,
          valid,
        })
    }

    const autoScroll = () => {
      if (!active) return
      if (scrollNear(lastX, lastY)) update(lastX, lastY)
      frame = requestAnimationFrame(autoScroll)
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      lastX = ev.clientX
      lastY = ev.clientY
      if (!active) {
        const moved = Math.hypot(lastX - startX, lastY - startY) > DRAG_THRESHOLD
        // On touch, moving before the long press means the user is scrolling.
        if (moved && touch) cleanup()
        else if (moved) activate(ev)
        return
      }
      update(lastX, lastY)
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      cleanup()
      if (!active) return
      // The click that follows a drag is not a click on the event or slot.
      const swallow = (click: Event) => {
        click.stopPropagation()
        click.preventDefault()
      }
      win.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => win.removeEventListener('click', swallow, true), 0)
      finish(ev)
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      cleanup()
      if (active) abort('escape')
    }

    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      cleanup()
      if (active) abort('escape')
    }

    function blockScroll(ev: TouchEvent) {
      if (active) ev.preventDefault()
    }

    function abort(reason: 'escape' | 'invalid' | 'unchanged' | 'outside') {
      state.value = null
      if (occ && kind !== 'select') {
        ctx.emit('event-drag-cancel', { ...base(occ, view, kind), reason })
        if (reason !== 'unchanged') ctx.announce(ctx.options.value.messages.dragCancelled)
      }
    }

    function finish(ev: PointerEvent) {
      const s = state.value
      if (!s?.preview && outside && occ && kind === 'move' && raw().eventLeave) {
        const target = leaveTarget
        state.value = null
        target?.receiveDrop(ev)
        for (const other of otherDropTargets(self)) other.receiveLeave()
        ctx.emit('event-leave', {
          occurrence: occ,
          event: occ.event,
          view,
          received: !!target,
          nativeEvent: ev,
        })
        return
      }
      if (!s?.preview) return abort(outside ? 'outside' : 'unchanged')
      if (!s.valid) {
        abort('invalid')
        if (occ && kind !== 'select' && s.reason)
          reportRefused(occ, kind, view, s.preview, s.reason)
        return
      }
      state.value = null
      if (kind === 'select') return emitSelect(view, s.preview, ev)
      const occTimes = {
        start: occ!.start,
        end: occ!.end,
        allDay: occ!.allDay,
        resourceIds: occ!.resourceIds,
      }
      if (sameTimes(s.preview, occTimes)) return abort('unchanged')
      if (kind === 'move' && raw().dragToDuplicate && (ev.ctrlKey || ev.metaKey)) {
        ctx.emit('event-duplicate', {
          occurrence: occ,
          event: occ!.event,
          view,
          ...s.preview,
          resourceIds: s.preview.resourceIds ?? occ!.resourceIds,
          nativeEvent: ev,
        })
        return
      }
      commit(occ!, kind, view, s.preview, ev, s.group ?? [])
    }

    endGesture = () => {
      cleanup()
      if (active) abort('escape')
    }
    win.addEventListener('pointermove', onMove)
    win.addEventListener('pointerup', onUp)
    win.addEventListener('pointercancel', onCancel)
    win.addEventListener('keydown', onKey, true)
    win.addEventListener('touchmove', blockScroll, { passive: false })
    if (touch) longPress = setTimeout(() => activate(e), raw().longPressDelay ?? 400)
  }

  const self: SchedulerInteraction = {
    state,
    mirror,
    selection,
    receiveMove,
    receiveLeave,
    receiveDrop,
    scrollNear,
    refusal,
    scrollToMinute(minute) {
      for (const surface of surfaces) surface.scrollToMinute?.(minute)
    },
    applyPending(occurrences) {
      const map = pending.value
      const group = state.value?.group
      if (!map.size && !group?.length) return occurrences
      return occurrences.map((occ) => {
        const live = group?.find((g) => g.occurrence.key === occ.key)
        if (live) return withTimes(occ, live.times)
        const p = map.get(occ.key)
        return p && p.event === occ.event ? withTimes(occ, p.times) : occ
      })
    },
    armMove,
    armed,
    placeArmed,
    pointer,
    selectEvent,
    groupOf,
    marquee,
    copy,
    paste,
    setCursor(hit) {
      cursor = hit
    },
    dropArmed,
    nativeDragOver,
    nativeDragLeave,
    nativeDrop,
    canDrag,
    canResize,
    get selectable() {
      return raw().selectable ?? false
    },
    registerSurface(surface) {
      surfaces.add(surface)
      return () => surfaces.delete(surface)
    },
    pointerDownOnEvent(e, occ, kind, view, originDate) {
      if (kind === 'move' ? !canDrag(occ) : !canResize(occ)) return
      clearSelection()
      startGesture(e, kind, view, occ, originDate)
    },
    pointerDownOnSlot(e, view) {
      if (raw().eventSelection && e.shiftKey) {
        startMarquee(e)
        return
      }
      if (raw().eventSelection && !e.ctrlKey && !e.metaKey) setSelected([])
      clearSelection()
      if (raw().selectable) startGesture(e, 'select', view, undefined)
    },
    keyboardChange(e, occ, kind, view, step) {
      if (kind === 'move' ? !canDrag(occ) : !canResize(occ)) return
      const opts = computeOptions(step.snapMinutes)
      const tz = opts.timeZone
      const date = occ.start.withTimeZone(tz).toPlainDate()
      const days = step.days ?? 0
      const minutes = step.minutes ?? 0
      let times: EventTimes | null
      if (step.timeline) {
        const from: Hit = { zone: 'timeline', date, minute: 0, resourceId: step.fromResource }
        const to: Hit = {
          zone: 'timeline',
          date: date.add({ days }),
          minute: minutes,
          resourceId: step.toResource ?? step.fromResource,
        }
        times =
          kind === 'move'
            ? computeMove(occ, from, to, opts)
            : computeResize(occ, kind === 'resize-start' ? 'start' : 'end', from, to, opts)
      } else if (occ.allDay) {
        if (minutes) return
        const from: Hit = { zone: 'all-day', date }
        const to: Hit = { zone: 'all-day', date: date.add({ days }) }
        times =
          kind === 'move'
            ? computeMove(occ, from, to, opts)
            : computeResize(occ, 'end', from, to, opts)
      } else {
        const from: Hit = { zone: 'time', date, minute: 0 }
        const to: Hit = { zone: 'time', date: date.add({ days }), minute: minutes }
        times =
          kind === 'move'
            ? computeMove(occ, from, to, opts)
            : computeResize(occ, kind === 'resize-start' ? 'start' : 'end', from, to, opts)
      }
      if (!times || sameTimes(times, occ)) return
      const reason = refusal(kind, occ, times)
      if (reason) {
        reportRefused(occ, kind, view, times, reason)
        return
      }
      requestFocus(occ, times)
      commit(occ, kind, view, times, e)
      // Follow an event moved out of the visible range.
      const target = times.start.withTimeZone(tz).toPlainDate()
      const range = ctx.range.value
      if (range && !rangeContains(range, target)) ctx.goTo(target)
    },
    setSelection(view, times, commitEvent) {
      if (!times) return clearSelection()
      if (commitEvent) emitSelect(view, times, commitEvent)
      else committedSelection.value = { view, times }
    },
    clearSelection,
    claimFocus,
    stopGesture: () => endGesture?.(),
    stopIfDeleted() {
      const s = state.value
      if (!s?.occurrence || s.kind === 'receive') return
      const id = s.occurrence.seriesId ?? s.occurrence.id
      if (!ctx.store.has(id)) endGesture?.()
    },
    prunePending() {
      const map = pending.value
      if (!map.size) return
      let changed = false
      const next = new Map(map)
      for (const [key, p] of map) {
        const id = ctx.accessors.value.id(p.event)
        const occ = p.occurrence
        const replaced =
          occ.recurring && occ.recurrenceId && ctx.store.hasException(occ.id, occ.recurrenceId)
        if (ctx.store.get(id) !== p.event || replaced) {
          next.delete(key)
          changed = true
        }
      }
      if (changed) pending.value = next
    },
  }
  return self
}
