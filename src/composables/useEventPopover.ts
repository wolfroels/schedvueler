import { ownerWindow } from './usePictureInPicture'
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  type CSSProperties,
  type ShallowRef,
} from 'vue'
import { anchorPosition, type AnchorOptions } from '../core'

/**
 * Headless popover or tooltip for an event: remembers what is open and where, closes on Escape and
 * on a click outside, and gives focus back. The markup stays yours.
 *
 * ```vue
 * const popover = useEventPopover<SchedulerEvent>()
 * // <Scheduler @event-click="(p) => popover.open(p.element, p.event)" />
 * // <div v-if="popover.isOpen.value" :ref="popover.setElement" :style="popover.style.value">...
 * ```
 */
export function useEventPopover<D = unknown>(options: AnchorOptions = {}) {
  const data = shallowRef<D>() as ShallowRef<D | undefined>
  const anchor = shallowRef<HTMLElement>()
  const element = shallowRef<HTMLElement>()
  const position = shallowRef<ReturnType<typeof anchorPosition>>()
  const isOpen = computed(() => anchor.value !== undefined)

  function update() {
    if (!anchor.value || !element.value) return
    position.value = anchorPosition(
      anchor.value.getBoundingClientRect(),
      { width: element.value.offsetWidth, height: element.value.offsetHeight },
      { width: (win ?? window).innerWidth, height: (win ?? window).innerHeight },
      options,
    )
  }

  function close() {
    if (!anchor.value) return
    const back = anchor.value
    anchor.value = undefined
    data.value = undefined
    position.value = undefined
    removeListeners()
    if (back.isConnected) back.focus?.()
  }

  function onDocumentPointerDown(e: Event) {
    const target = e.target as Node
    if (!element.value?.contains(target) && !anchor.value?.contains(target)) close()
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close()
  }
  // The window the anchor is in, which is the picture-in-picture one while popped out.
  let win: (Window & typeof globalThis) | undefined
  function removeListeners() {
    if (!win) return
    win.document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    win.document.removeEventListener('keydown', onKey)
    win.removeEventListener('resize', update)
    win.removeEventListener('scroll', update, true)
    win = undefined
  }

  function open(target: HTMLElement, value?: D) {
    if (!anchor.value) {
      win = ownerWindow(target)
      win.document.addEventListener('pointerdown', onDocumentPointerDown, true)
      win.document.addEventListener('keydown', onKey)
      win.addEventListener('resize', update)
      win.addEventListener('scroll', update, true)
    }
    anchor.value = target
    data.value = value
    update()
  }

  /** Use as a function ref on the popover element. */
  function setElement(el: unknown) {
    element.value = (el ?? undefined) as HTMLElement | undefined
    update()
  }

  const style = computed<CSSProperties>(() => ({
    position: 'fixed',
    left: `${position.value?.left ?? 0}px`,
    top: `${position.value?.top ?? 0}px`,
    visibility: position.value ? undefined : 'hidden',
  }))

  if (getCurrentScope()) onScopeDispose(removeListeners)

  return { isOpen, data, anchor, position, style, open, close, update, setElement }
}
