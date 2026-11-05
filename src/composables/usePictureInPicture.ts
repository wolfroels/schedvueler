import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
  type ComputedRef,
  type ShallowRef,
} from 'vue'

/** Popping the scheduler out into its own always-on-top window (Document Picture-in-Picture). */
export interface SchedulerPictureInPicture {
  /** Whether the browser supports it and `picture-in-picture` is not `false`. */
  available: ComputedRef<boolean>
  /** The picture-in-picture window while the scheduler is in it, else `null`. */
  window: Readonly<ShallowRef<Window | null>>
  /** Moves the scheduler into a picture-in-picture window. Resolves to whether it did. */
  open(): Promise<boolean>
  /** Brings the scheduler back into the page. */
  close(): void
  toggle(): Promise<boolean>
}

interface DocumentPictureInPicture {
  window: Window | null
  requestWindow(options?: {
    width?: number
    height?: number
    disallowReturnToOpener?: boolean
    preferInitialWindowPlacement?: boolean
  }): Promise<Window>
}

function api(): DocumentPictureInPicture | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture
}

/** Copies the page's styles (and the attributes on `<html>`, for themes) into the new window. */
function copyStyles(from: Document, to: Document) {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const style = to.createElement('style')
      if (sheet.media.mediaText) style.media = sheet.media.mediaText
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n')
      to.head.appendChild(style)
    } catch {
      // Cross-origin sheets can't be read; link them instead.
      if (!sheet.href) continue
      const link = to.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      if (sheet.media.mediaText) link.media = sheet.media.mediaText
      to.head.appendChild(link)
    }
  }
  for (const { name, value } of Array.from(from.documentElement.attributes))
    to.documentElement.setAttribute(name, value)
  const base = to.createElement('style')
  base.textContent =
    'html,body{height:100%;margin:0}' +
    'body>.schedvueler{height:100%!important;max-height:none!important;border-radius:0}'
  to.head.appendChild(base)
}

export function usePictureInPicture(
  enabled: () => boolean,
  root: () => HTMLElement | undefined,
  title: () => string,
): SchedulerPictureInPicture {
  // False on the server and while hydrating, so the button doesn't cause a mismatch.
  const mounted = shallowRef(false)
  const pip = shallowRef<Window | null>(null)
  const available = computed(() => mounted.value && enabled() && !!api())

  if (getCurrentInstance()) {
    onMounted(() => (mounted.value = true))
    onBeforeUnmount(close)
  }

  async function open(): Promise<boolean> {
    const pipApi = api()
    if (pip.value || !pipApi || !enabled()) return !!pip.value
    const el = root()
    let win: Window
    try {
      win = await pipApi.requestWindow({
        width: Math.max(320, Math.round(el?.offsetWidth ?? 800)),
        height: Math.max(240, Math.round(el?.offsetHeight ?? 600)),
      })
    } catch {
      // Not from a user gesture, not a top-level page, or the browser refused.
      return false
    }
    copyStyles(el?.ownerDocument ?? document, win.document)
    win.document.title = title()
    win.addEventListener('pagehide', () => {
      if (pip.value === win) pip.value = null
    })
    pip.value = win
    return true
  }

  function close() {
    const win = pip.value
    if (!win) return
    pip.value = null
    win.close()
  }

  watch(enabled, (on) => {
    if (!on) close()
  })
  watch(title, (text) => {
    if (pip.value) pip.value.document.title = text
  })

  return {
    available,
    window: pip,
    open,
    close,
    toggle: () => (pip.value ? (close(), Promise.resolve(false)) : open()),
  }
}

/** The window an element is in; the picture-in-picture window while the scheduler is popped out. */
export function ownerWindow(node: Node | null | undefined): Window & typeof globalThis {
  return (node?.ownerDocument?.defaultView as (Window & typeof globalThis) | null) ?? window
}
