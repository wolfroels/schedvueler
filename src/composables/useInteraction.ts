import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import {
  computeMove,
  computeResize,
  computeSelection,
  formatDate,
  formatTimeRange,
  sameTimes,
  withTimes,
  type EventOccurrence,
  type EventTimes,
  type Hit,
  type ResourceId,
} from '../core'
import type { EventChangeKind, SelectPayload } from '../types'
import { createCancelable } from './cancelable'
import type { SchedulerContext } from './context'

/** A rendered area that can tell what is under the pointer (a time grid, a month grid, ...). */
export interface DragSurface {
  hitTest(clientX: number, clientY: number): Hit | null
  /** Scroll container to auto-scroll near its edges while dragging. */
  scrollElement?: () => HTMLElement | null | undefined
  /** Minutes to snap gestures that start on this surface to. Defaults to the scheduler's. */
  snapMinutes?: () => number
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
  kind: EventChangeKind | 'select'
  view: string
  occurrence: EventOccurrence<unknown> | undefined
  origin: Hit
  preview: EventTimes | null
  valid: boolean
}

export interface Selection {
  view: string
  times: EventTimes
}

interface PendingChange {
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
  /** Applies optimistic changes to queried occurrences. */
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
  /** Drops optimistic changes whose events were replaced (called when events change). */
  prunePending(): void
}

const DRAG_THRESHOLD = 4
const EDGE = 48

export function createInteraction(ctx: SchedulerContext<unknown>): SchedulerInteraction {
  const state = shallowRef<DragState | null>(null)
  const committedSelection = shallowRef<Selection | null>(null)
  const pending = shallowRef(new Map<string, PendingChange>())
  const surfaces = new Set<DragSurface>()

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
    if (!(o.eventDraggable ?? o.editable ?? false)) return false
    return o.canDrag ? o.canDrag(occ) : true
  }

  function canResize(occ: EventOccurrence<unknown>): boolean {
    const o = raw()
    if (!(o.eventResizable ?? o.editable ?? false)) return false
    return o.canResize ? o.canResize(occ) : true
  }

  function isValid(
    kind: DragState['kind'],
    occ: EventOccurrence<unknown> | undefined,
    times: EventTimes,
  ) {
    const o = raw()
    if (kind === 'select') return o.canSelect ? o.canSelect(selectInfo(times)) : true
    return o.canDrop && occ
      ? o.canDrop({
          occurrence: occ,
          kind,
          ...times,
          resourceIds: times.resourceIds ?? occ.resourceIds,
        })
      : true
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
  ) {
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
      recurring: occ.recurring,
      scope: raw().recurrenceEditScope ?? 'this',
      nativeEvent,
    })

    // Show the new position right away; it stays until `events` changes or the change is reverted.
    const revert = () => {
      if (pending.value.get(occ.key)?.times !== times) return
      const next = new Map(pending.value)
      next.delete(occ.key)
      pending.value = next
    }
    pending.value = new Map(pending.value).set(occ.key, { event: occ.event, times })

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
    const payload: SelectPayload = { view, ...selectInfo(times), nativeEvent }
    ctx.emit('select', payload)
    ctx.announce(ctx.options.value.messages.selected(describe(times)))
  }

  function clearSelection() {
    if (!committedSelection.value) return
    committedSelection.value = null
    ctx.emit('unselect', undefined)
  }

  // --- pointer gestures ------------------------------------------------------------------------

  function startGesture(
    e: PointerEvent,
    kind: DragState['kind'],
    view: string,
    occ: EventOccurrence<unknown> | undefined,
  ) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const found = hit(e.clientX, e.clientY)
    if (!found) return
    const origin = found.hit
    const opts = computeOptions(found.surface.snapMinutes?.() ?? snapMinutes())

    const touch = e.pointerType !== 'mouse'
    const pointerId = e.pointerId
    const startX = e.clientX
    const startY = e.clientY
    let lastX = startX
    let lastY = startY
    let active = false
    let longPress: ReturnType<typeof setTimeout> | undefined
    let frame = 0

    const cleanup = () => {
      clearTimeout(longPress)
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('touchmove', blockScroll)
      document.documentElement.classList.remove('orb-dragging')
    }

    const activate = (nativeEvent: PointerEvent) => {
      if (occ && kind !== 'select') {
        const { payload, settle } = createCancelable({ ...base(occ, view, kind), nativeEvent })
        ctx.emit('event-drag-start', payload)
        if (settle() !== true) return cleanup()
      }
      active = true
      state.value = { kind, view, occurrence: occ, origin, preview: null, valid: true }
      document.documentElement.classList.add('orb-dragging')
      if (touch) navigator.vibrate?.(10)
      update(lastX, lastY)
      autoScroll()
    }

    const update = (x: number, y: number) => {
      const s = state.value
      if (!s) return
      const current = hit(x, y)?.hit
      if (!current) return
      let preview: EventTimes | null
      if (kind === 'select') preview = computeSelection(origin, current, opts)
      else if (kind === 'move') preview = computeMove(occ!, origin, current, opts)
      else
        preview = computeResize(
          occ!,
          kind === 'resize-start' ? 'start' : 'end',
          origin,
          current,
          opts,
        )
      if (!preview || sameTimes(preview, s.preview)) return
      const valid = isValid(kind, occ, preview)
      state.value = { ...s, preview, valid }
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
      const edgeSpeed = (pos: number, start: number, end: number) =>
        pos < start + EDGE
          ? -(start + EDGE - pos) / 3
          : pos > end - EDGE
            ? (pos - end + EDGE) / 3
            : 0
      for (const surface of surfaces) {
        const el = surface.scrollElement?.()
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (lastX < rect.left || lastX > rect.right || lastY < rect.top || lastY > rect.bottom)
          continue
        const dy = edgeSpeed(lastY, rect.top, rect.bottom)
        const dx = el.scrollWidth > el.clientWidth ? edgeSpeed(lastX, rect.left, rect.right) : 0
        if (dx || dy) {
          el.scrollTop += dy
          el.scrollLeft += dx
          update(lastX, lastY)
        }
      }
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
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, true), 0)
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

    function abort(reason: 'escape' | 'invalid' | 'unchanged') {
      state.value = null
      if (occ && kind !== 'select') {
        ctx.emit('event-drag-cancel', { ...base(occ, view, kind), reason })
        if (reason !== 'unchanged') ctx.announce(ctx.options.value.messages.dragCancelled)
      }
    }

    function finish(ev: PointerEvent) {
      const s = state.value
      if (!s?.preview) return abort('unchanged')
      if (!s.valid) return abort('invalid')
      state.value = null
      if (kind === 'select') return emitSelect(view, s.preview, ev)
      const occTimes = {
        start: occ!.start,
        end: occ!.end,
        allDay: occ!.allDay,
        resourceIds: occ!.resourceIds,
      }
      if (sameTimes(s.preview, occTimes)) return abort('unchanged')
      commit(occ!, kind, view, s.preview, ev)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('touchmove', blockScroll, { passive: false })
    if (touch) longPress = setTimeout(() => activate(e), raw().longPressDelay ?? 400)
  }

  return {
    state,
    mirror,
    selection,
    applyPending(occurrences) {
      const map = pending.value
      if (!map.size) return occurrences
      return occurrences.map((occ) => {
        const p = map.get(occ.key)
        return p && p.event === occ.event ? withTimes(occ, p.times) : occ
      })
    },
    canDrag,
    canResize,
    get selectable() {
      return raw().selectable ?? false
    },
    registerSurface(surface) {
      surfaces.add(surface)
      return () => surfaces.delete(surface)
    },
    pointerDownOnEvent(e, occ, kind, view) {
      if (kind === 'move' ? !canDrag(occ) : !canResize(occ)) return
      clearSelection()
      startGesture(e, kind, view, occ)
    },
    pointerDownOnSlot(e, view) {
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
      if (!times || sameTimes(times, occ) || !isValid(kind, occ, times)) return
      e.preventDefault()
      commit(occ, kind, view, times, e)
    },
    setSelection(view, times, commitEvent) {
      if (!times) return clearSelection()
      if (commitEvent) emitSelect(view, times, commitEvent)
      else committedSelection.value = { view, times }
    },
    clearSelection,
    prunePending() {
      const map = pending.value
      if (!map.size) return
      let changed = false
      const next = new Map(map)
      for (const [key, p] of map) {
        const id = ctx.accessors.value.id(p.event)
        if (ctx.store.get(id) !== p.event) {
          next.delete(key)
          changed = true
        }
      }
      if (changed) pending.value = next
    },
  }
}
