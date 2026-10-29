import type { Directive } from 'vue'
import type { ExternalEventTemplate } from '../types'
import type { SchedulerInteraction } from './useInteraction'

/** Every mounted scheduler, so a drag that starts outside all of them can find the one below. */
const schedulers = new Set<SchedulerInteraction>()

/** Makes a scheduler a drop target for `startExternalDrag`. Returns the unregister function. */
export function registerDropTarget(interaction: SchedulerInteraction): () => void {
  schedulers.add(interaction)
  return () => schedulers.delete(interaction)
}

export interface ExternalDragOptions {
  /** Touch: how long to press before the drag starts, in ms. Default 400. */
  longPressDelay?: number
  /** Show a small chip with the title next to the pointer outside the schedulers. Default true. */
  ghost?: boolean
}

const DRAG_THRESHOLD = 4

/**
 * Starts dragging an event from outside the scheduler. Call it from a `pointerdown` handler on
 * the source element (or use the `v-orb-draggable` directive, which does exactly that).
 *
 * While the pointer is over a scheduler, it shows the event where it would land; dropping there
 * emits `before-event-receive` and `event-receive` on that scheduler. Escape cancels. On touch, a
 * long press starts the drag, so the source list can still be scrolled.
 */
export function startExternalDrag(
  e: PointerEvent,
  template: ExternalEventTemplate,
  options: ExternalDragOptions = {},
): void {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const touch = e.pointerType !== 'mouse'
  const pointerId = e.pointerId
  const startX = e.clientX
  const startY = e.clientY
  let lastX = startX
  let lastY = startY
  let active = false
  let over: SchedulerInteraction | null = null
  let ghost: HTMLElement | null = null
  let longPress: ReturnType<typeof setTimeout> | undefined
  let frame = 0

  // Keep the browser from selecting text or starting a native drag of the source.
  if (e.pointerType === 'mouse') e.preventDefault()

  const cleanup = () => {
    clearTimeout(longPress)
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('touchmove', blockScroll)
    document.documentElement.classList.remove('orb-dragging')
    ghost?.remove()
    ghost = null
  }

  const leaveAll = () => {
    for (const s of schedulers) s.receiveLeave()
    over = null
  }

  const update = () => {
    let found: SchedulerInteraction | null = null
    for (const s of schedulers) {
      if (!found && s.receiveMove(template, lastX, lastY)) found = s
      else s.receiveLeave()
    }
    over = found
    if (ghost) {
      ghost.hidden = !!found
      ghost.style.transform = `translate(${lastX + 12}px, ${lastY + 12}px)`
    }
  }

  const autoScroll = () => {
    if (!active) return
    if (over?.scrollNear(lastX, lastY)) update()
    frame = requestAnimationFrame(autoScroll)
  }

  const activate = () => {
    active = true
    document.documentElement.classList.add('orb-dragging')
    if (touch) navigator.vibrate?.(10)
    if (options.ghost !== false && typeof document !== 'undefined') {
      ghost = document.createElement('div')
      ghost.className = 'orb-drag-ghost'
      ghost.textContent = template.title ?? ''
      if (template.color) ghost.style.setProperty('--orb-event-color', template.color)
      ghost.setAttribute('aria-hidden', 'true')
      document.body.appendChild(ghost)
    }
    update()
    autoScroll()
  }

  function onMove(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    lastX = ev.clientX
    lastY = ev.clientY
    if (!active) {
      const moved = Math.hypot(lastX - startX, lastY - startY) > DRAG_THRESHOLD
      // On touch, moving before the long press means the user is scrolling.
      if (moved && touch) cleanup()
      else if (moved) activate()
      return
    }
    update()
  }

  function onUp(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    const target = active ? over : null
    cleanup()
    if (!active) return
    // The click that follows a drag is not a click on whatever is under the pointer.
    const swallow = (click: Event) => {
      click.stopPropagation()
      click.preventDefault()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, true), 0)
    if (target) target.receiveDrop(ev)
    leaveAll()
  }

  function onCancel(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    cleanup()
    leaveAll()
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key !== 'Escape' || !active) return
    ev.preventDefault()
    ev.stopPropagation()
    cleanup()
    leaveAll()
  }

  function blockScroll(ev: TouchEvent) {
    if (active) ev.preventDefault()
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('touchmove', blockScroll, { passive: false })
  if (touch) longPress = setTimeout(activate, options.longPressDelay ?? 400)
}

type DraggableValue = ExternalEventTemplate | (() => ExternalEventTemplate) | null | undefined

const templates = new WeakMap<HTMLElement, DraggableValue>()
const handlers = new WeakMap<HTMLElement, (e: PointerEvent) => void>()

/**
 * `v-orb-draggable="{ title: 'Inspection', duration: 90, data: item }"` makes an element outside
 * the scheduler draggable into it. Pass `null` to disable it. See `startExternalDrag`.
 */
export const vOrbDraggable: Directive<HTMLElement, DraggableValue> = {
  mounted(el, binding) {
    templates.set(el, binding.value)
    el.classList.add('orb-draggable')
    const handler = (e: PointerEvent) => {
      const value = templates.get(el)
      const template = typeof value === 'function' ? value() : value
      if (template) startExternalDrag(e, template)
    }
    handlers.set(el, handler)
    el.addEventListener('pointerdown', handler)
  },
  updated(el, binding) {
    templates.set(el, binding.value)
    el.classList.toggle('orb-draggable', !!binding.value)
  },
  unmounted(el) {
    const handler = handlers.get(el)
    if (handler) el.removeEventListener('pointerdown', handler)
    el.classList.remove('orb-draggable')
  },
}
