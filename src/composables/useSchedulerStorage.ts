import { onMounted, shallowRef, watch, type Ref } from 'vue'
import { Temporal } from '../core'

interface TimelinePreference {
  resourceAreaWidth?: number
  zoom?: number
}

interface StoredPreferences {
  version: 1
  view?: string
  date?: string
  timelines: Record<string, TimelinePreference>
}

export function clearStorage(storageKey: string): void {
  if (!storageKey || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {}
}

export function useSchedulerStorage(
  key: () => string | undefined,
  state: { view: Ref<string | undefined>; date: Ref<string | undefined> },
  activeView: Readonly<Ref<string | undefined>>,
  date: Readonly<Ref<Temporal.PlainDate>>,
) {
  const timelines = shallowRef<Record<string, TimelinePreference>>({})
  let mounted = false
  let restoring = false

  function restore() {
    restoring = true
    timelines.value = {}
    try {
      const storageKey = key()
      const stored: unknown = storageKey
        ? JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
        : null
      if (!stored || typeof stored !== 'object' || !('version' in stored) || stored.version !== 1)
        return
      const saved = stored as Partial<StoredPreferences>
      if (typeof saved.date === 'string') {
        try {
          state.date.value = Temporal.PlainDate.from(saved.date).toString()
        } catch {}
      }
      if (typeof saved.view === 'string' && saved.view.length) state.view.value = saved.view
      if (saved.timelines && typeof saved.timelines === 'object') {
        timelines.value = Object.fromEntries(
          Object.entries(saved.timelines).flatMap(([name, value]) => {
            if (!value || typeof value !== 'object') return []
            const preference: TimelinePreference = {}
            if (
              typeof value.resourceAreaWidth === 'number' &&
              Number.isFinite(value.resourceAreaWidth) &&
              value.resourceAreaWidth >= 80
            ) {
              preference.resourceAreaWidth = value.resourceAreaWidth
            }
            if (
              typeof value.zoom === 'number' &&
              Number.isSafeInteger(value.zoom) &&
              value.zoom >= 0
            ) {
              preference.zoom = value.zoom
            }
            return [[name, preference]]
          }),
        )
      }
    } catch {
    } finally {
      restoring = false
    }
  }

  function save() {
    const storageKey = key()
    if (!mounted || restoring || !storageKey) return
    try {
      const saved: StoredPreferences = {
        version: 1,
        view: activeView.value,
        date: date.value.toString(),
        timelines: timelines.value,
      }
      window.localStorage.setItem(storageKey, JSON.stringify(saved))
    } catch {}
  }

  onMounted(() => {
    restore()
    mounted = true
  })
  watch(
    key,
    () => {
      if (mounted) restore()
    },
    { flush: 'sync' },
  )
  watch([activeView, date, timelines], save, { flush: 'sync' })

  return {
    timelines,
    updateTimeline(view: string, preference: TimelinePreference) {
      timelines.value = {
        ...timelines.value,
        [view]: { ...timelines.value[view], ...preference },
      }
    },
    clearStorage: () => clearStorage(key() ?? ''),
  }
}

export type SchedulerStorage = ReturnType<typeof useSchedulerStorage>
