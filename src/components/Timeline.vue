<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import {
  dependencyLinks,
  groupByResource,
  headerTiers,
  loadPerDay,
  zonedAtMinute,
  type Hit,
  type ResourceId,
  type ResourceNode,
  type Temporal,
} from '../core'
import { parseTimeOfDay, useSchedulerContext } from '../composables/context'
import type { AvailabilityShade } from '../composables/useAvailability'
import type { SlotResolver } from '../composables/useSchedulerView'
import { visibleHours } from '../composables/validate'
import { ownerWindow } from '../composables/usePictureInPicture'
import { useTimeline, type TimelineDay, type TimelineRow } from '../composables/useTimeline'
import type { ResourceColumn, ResourceLabelSlotProps } from '../types'
import EventItem from './EventItem.vue'
import { stableStyle } from './stable-style'
import { isRtl } from './direction'
import { RenderSlot } from './RenderSlot'
import type { TimelineSettings } from './view-props'

const props = defineProps<{
  view: string
  days: readonly Temporal.PlainDate[]
  settings: TimelineSettings
  resolve: SlotResolver
}>()
const emit = defineEmits<{ 'update:zoom': [level: number] }>()

const ctx = useSchedulerContext()
const interaction = ctx.interaction
const messages = computed(() => ctx.options.value.messages)

/** Rows: visible resources (collapsed groups hide their children), optionally filtered. */
const rowResources = computed(() => {
  if (props.settings.byEvent) return []
  const ids = props.settings.resourceIds
  const visible = ctx.visibleResources.value
  if (!ids) return visible
  const wanted = new Set(ids)
  return visible.filter((r) => wanted.has(r.id))
})

const isCompact = (s: TimelineSettings) => s.dayEvents === 'compact' && s.slotDuration >= 1440

/** Slot columns per day, as laid out by the timeline. */
function slotsPerDay(s: TimelineSettings): number {
  if (s.slotDuration >= 1440) return 1
  const o = ctx.options.value
  const [start, end] = visibleHours(
    parseTimeOfDay(s.dayStartTime, o.dayStartMinute),
    parseTimeOfDay(s.dayEndTime, o.dayEndMinute),
  )
  return Math.max(1, Math.ceil((end - start) / s.slotDuration))
}

const config = computed(() => {
  const s = props.settings
  const o = ctx.options.value
  const [dayStartMinute, dayEndMinute] = visibleHours(
    parseTimeOfDay(s.dayStartTime, o.dayStartMinute),
    parseTimeOfDay(s.dayEndTime, o.dayEndMinute),
  )
  return {
    days: props.days,
    resources: rowResources.value,
    slotDuration: s.slotDuration,
    slotLabelInterval: s.slotLabelInterval ?? Math.max(60, s.slotDuration),
    dayStartMinute,
    dayEndMinute,
    eventHeight: isCompact(s) ? 8 : s.eventHeight,
    laneGap: 2,
    rowPadding: 4,
    rowMinHeight: s.rowMinHeight,
    // About 24px at the configured slot width.
    minEventWidth: 24 / (s.slotWidth * props.days.length * slotsPerDay(s)),
    byEvent: s.byEvent,
    narrowDays: s.slotDuration >= 1440 && s.slotWidth < 80,
  }
})

const {
  axis,
  days: dayList,
  slots,
  slotCount,
  daySlots,
  rows,
  totalHeight,
  rowAt,
  overlays,
  nowPosition,
  slotAt,
} = useTimeline(ctx, config)

const snapMinutes = () => props.settings.snapDuration

const selectionScope = computed(() => {
  const sel = interaction.selection.value
  return sel
    ? { view: props.view, ...sel.times, resourceId: sel.times.resourceIds?.[0] }
    : undefined
})
const pct = (fraction: number) => `${fraction * 100}%`

// --- resource columns ------------------------------------------------------------------------------

const areaWidth = ref<number>()
watch(
  () => ctx.storage.timelines.value[props.view]?.resourceAreaWidth,
  async (width) => {
    areaWidth.value = width
    if (width !== undefined) {
      await nextTick()
      if (root.value) setAreaWidth(width)
    }
  },
  { immediate: true },
)
const resizingArea = ref(false)
let stopAreaResize: (() => void) | undefined
const resourceGrid = computed(() =>
  [
    'minmax(0, 1fr)',
    ...(props.settings.resourceColumns ?? []).map((c) => c.width ?? 'minmax(0, 1fr)'),
  ].join(' '),
)

function columnValue(column: ResourceColumn, resource: ResourceNode<unknown>) {
  return column.value
    ? column.value(resource)
    : (resource.resource as Record<string, unknown> | undefined)?.[column.key]
}

function setAreaWidth(width: number) {
  areaWidth.value = Math.max(
    80,
    Math.min(width, Math.max(80, (root.value?.clientWidth ?? 160) - 80)),
  )
}

function onResizerKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const width = corner.value?.offsetWidth ?? 0
  const direction = isRtl(root.value!) ? -1 : 1
  const step = event.shiftKey ? 40 : 10
  setAreaWidth(
    event.key === 'Home'
      ? 80
      : event.key === 'End'
        ? root.value!.clientWidth - 80
        : width + (event.key === 'ArrowRight' ? step : -step) * direction,
  )
  ctx.emit('resource-area-resize', { view: props.view, width: areaWidth.value! })
  ctx.storage.updateTimeline(props.view, { resourceAreaWidth: areaWidth.value })
}

function onResizerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  stopAreaResize?.()
  resizingArea.value = true
  const startX = e.clientX
  const startWidth = corner.value?.offsetWidth ?? 0
  const rtl = isRtl(root.value!)
  const win = ownerWindow(root.value)
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    const delta = rtl ? startX - ev.clientX : ev.clientX - startX
    setAreaWidth(startWidth + delta)
  }
  const cleanup = () => {
    win.removeEventListener('pointermove', onMove)
    win.removeEventListener('pointerup', onUp)
    win.removeEventListener('pointercancel', onCancel)
    resizingArea.value = false
    stopAreaResize = undefined
  }
  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== e.pointerId) return
    cleanup()
    ctx.storage.updateTimeline(props.view, { resourceAreaWidth: areaWidth.value ?? startWidth })
    ctx.emit('resource-area-resize', { view: props.view, width: areaWidth.value ?? startWidth })
  }
  const onCancel = (event: PointerEvent) => {
    if (event.pointerId !== e.pointerId) return
    areaWidth.value = startWidth
    cleanup()
  }
  stopAreaResize = cleanup
  win.addEventListener('pointermove', onMove)
  win.addEventListener('pointerup', onUp)
  win.addEventListener('pointercancel', onCancel)
}

onBeforeUnmount(() => stopAreaResize?.())

// --- reordering rows -------------------------------------------------------------------------------

const reorder = shallowRef<{ id: ResourceId; target: ResourceId; position: 'before' | 'after' }>()

function onLabelPointerDown(e: PointerEvent, resource: ResourceNode<unknown>) {
  if (!props.settings.resourceReorder || (e.target as HTMLElement).closest('button')) return
  const startY = e.clientY
  const win = ownerWindow(e.target as Node)
  let moved = false
  const onMove = (ev: PointerEvent) => {
    if (!moved && Math.abs(ev.clientY - startY) < 4) return
    moved = true
    const top = body.value!.getBoundingClientRect().top
    const row = rows.value[rowAt(ev.clientY - top)]
    if (!row) return
    const position = ev.clientY - top < row.top + row.height / 2 ? 'before' : 'after'
    reorder.value = { id: resource.id, target: row.resource.id, position }
  }
  const finish = (commit: boolean) => {
    win.removeEventListener('pointermove', onMove)
    win.removeEventListener('pointerup', onUp)
    win.removeEventListener('keydown', onKey, true)
    const r = reorder.value
    reorder.value = undefined
    if (!commit || !r || r.target === r.id) return
    const map = ctx.resourceMap.value
    ctx.emit('resource-reorder', {
      resource: map.get(r.id),
      target: map.get(r.target),
      position: r.position,
    })
  }
  const onUp = () => finish(true)
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') finish(false)
  }
  win.addEventListener('pointermove', onMove)
  win.addEventListener('pointerup', onUp)
  win.addEventListener('keydown', onKey, true)
}

// --- load per day -----------------------------------------------------------------------------------

/** A resource's own events and those of everything below it, for group totals. */
function subtreeIds(resource: ResourceNode<unknown>): ResourceId[] {
  const map = ctx.resourceMap.value
  const ids = [resource.id]
  for (let i = 0; i < ids.length; i++) ids.push(...(map.get(ids[i]!)?.childIds ?? []))
  return ids
}

const occurrencesByResource = computed(() => groupByResource(ctx.occurrences.value))

function rowLoad(resource: ResourceNode<unknown>) {
  const option = props.settings.load
  if (!option) return []
  const given = option === true ? undefined : option.capacity
  const leaves = subtreeIds(resource).filter(
    (id) => !ctx.resourceMap.value.get(id)?.childIds.length,
  )
  const each = (id: ResourceId) => {
    const node = ctx.resourceMap.value.get(id)!
    return typeof given === 'function' ? given(node) : (given ?? 480)
  }
  const capacity = leaves.reduce<number>((sum, id) => sum + each(id), 0) || 480
  const seen = new Set<string>()
  const list = leaves
    .flatMap((id) => occurrencesByResource.value.get(id) ?? [])
    .filter((o) => !seen.has(o.key) && !!seen.add(o.key))
  const a = axis.value
  const tz = ctx.options.value.timeZone
  return loadPerDay(list, props.days, tz).map((load, i) => {
    const ratio = load.minutes / capacity
    return {
      ...load,
      key: load.date.toString(),
      capacity,
      ratio,
      level: ratio === 0 ? 0 : ratio < 0.5 ? 1 : ratio < 0.8 ? 2 : ratio <= 1 ? 3 : 4,
      left: i / a.days.length,
      width: 1 / a.days.length,
    }
  })
}

// --- count per day ----------------------------------------------------------------------------------

const countsOnly = computed(() => props.settings.dayEvents === 'count' && daySlots.value)

function dayCounts(row: TimelineRow<unknown>) {
  const timed = row.items.filter((i) => !i.occurrence.allDay).map((i) => i.occurrence)
  const n = props.days.length
  return loadPerDay(timed, props.days, ctx.options.value.timeZone)
    .map((load, i) => ({
      key: load.date.toString(),
      date: load.date,
      occurrences: load.occurrences,
      count: load.occurrences.length,
      left: i / n,
      width: 1 / n,
    }))
    .filter((c) => c.count > 0)
}

// --- virtual time axis ------------------------------------------------------------------------------

/** The part of the axis in view, as fractions, with some room on both sides. */
const xWindow = shallowRef({ from: 0, to: 1 })
let xFrame = 0

function measureX() {
  xFrame = 0
  const el = scroller.value
  const head = timeHead.value
  if (!el || !head) return
  const width = head.offsetWidth
  const area = el.clientWidth - (corner.value?.offsetWidth ?? 0)
  if (!width || width <= area) {
    if (xWindow.value.from !== 0 || xWindow.value.to !== 1) xWindow.value = { from: 0, to: 1 }
    return
  }
  const room = area / width
  const position = Math.abs(el.scrollLeft) / width
  // Steps of half a screen, so that scrolling only re-renders now and then.
  const step = room / 2
  const from = Math.max(0, Math.floor(position / step) * step - step)
  const to = Math.min(1, Math.ceil((position + room) / step) * step + step)
  if (from !== xWindow.value.from || to !== xWindow.value.to) xWindow.value = { from, to }
}

function onScrollX() {
  if (!xFrame) xFrame = requestAnimationFrame(measureX)
  measureY()
  measureViewport()
}

/** The part of the rows in view in px, in steps, with some room on both sides. */
const yWindow = shallowRef({ top: 0, bottom: Infinity })

function measureY() {
  const el = scroller.value
  if (!el) return
  const screen = el.clientHeight || 800
  const offset = Math.max(0, el.scrollTop - scrollMargin.value)
  const step = screen / 2
  const top = Math.max(0, Math.floor(offset / step) * step - step)
  const bottom = Math.ceil((offset + screen) / step) * step + step
  if (top !== yWindow.value.top || bottom !== yWindow.value.bottom) yWindow.value = { top, bottom }
}

/** What is in view on a row: rows can be far taller than the screen when many events overlap. */
function visibleItems<
  I extends { left: number; width: number; lane: number; occurrence: { key: string } },
>(items: readonly I[], rowStart: number): readonly I[] {
  if (!props.settings.virtual) return items
  const { from, to } = xWindow.value
  const { top, bottom } = yWindow.value
  const { eventHeight, laneGap, rowPadding } = config.value
  const laneSize = eventHeight + laneGap
  const dragged = interaction.state.value?.occurrence?.key
  return items.filter((i) => {
    if (i.occurrence.key === dragged) return true
    const y = rowStart + rowPadding + i.lane * laneSize
    return i.left < to && i.left + i.width > from && y < bottom && y + eventHeight > top
  })
}

/** Slot headings in view, with their column on the grid. */
const visibleSlots = computed(() => {
  const perDay = slots.value.length
  const total = dayList.value.length * perDay
  const virtual = props.settings.virtual
  const { from, to } = xWindow.value
  const out: {
    key: string
    column: number
    day: TimelineDay
    slot: (typeof slots.value)[number]
  }[] = []
  dayList.value.forEach((day, d) => {
    slots.value.forEach((slot, s) => {
      const index = d * perDay + s
      if (virtual && ((index + 1) / total < from || index / total > to)) return
      out.push({ key: `${day.key}-${slot.minute}`, column: index + 1, day, slot })
    })
  })
  return out
})

// --- zoom -------------------------------------------------------------------------------------------

function onWheel(e: WheelEvent) {
  const levels = props.settings.zoomLevels
  if (!levels?.length || !(e.ctrlKey || e.metaKey)) return
  e.preventDefault()
  const current = props.settings.zoomLevel ?? 0
  const next = Math.min(levels.length - 1, Math.max(0, current + (e.deltaY < 0 ? 1 : -1)))
  if (next === current) return
  // Keep the moment under the pointer where it is.
  const el = scroller.value!
  const fraction = laneFraction(e.clientX)
  const pointer =
    Math.abs(
      e.clientX - (isRtl(el) ? el.getBoundingClientRect().right : el.getBoundingClientRect().left),
    ) - (corner.value?.offsetWidth ?? 0)
  emit('update:zoom', next)
  ctx.emit('zoom-change', { view: props.view, level: next })
  void nextTick(() => {
    const distance = Math.max(0, fraction * timeHead.value!.offsetWidth - pointer)
    el.scrollLeft = isRtl(el) ? -distance : distance
    measureX()
  })
}

function setZoom(level: number) {
  emit('update:zoom', level)
  ctx.emit('zoom-change', { view: props.view, level })
  void nextTick(measureX)
}

// --- minimap ----------------------------------------------------------------------------------------

/** What is on screen along the axis, without the room `xWindow` keeps. */
const viewport = shallowRef({ from: 0, to: 1 })

function measureViewport() {
  const el = scroller.value
  const head = timeHead.value
  if (!el || !head || !props.settings.minimap) return
  const width = head.offsetWidth || 1
  const area = el.clientWidth - (corner.value?.offsetWidth ?? 0)
  const from = Math.abs(el.scrollLeft) / width
  viewport.value = { from, to: Math.min(1, from + area / width) }
}

const minimapDays = computed(() => {
  if (!props.settings.minimap) return []
  const loads = loadPerDay(ctx.occurrences.value, props.days, ctx.options.value.timeZone)
  const most = Math.max(1, ...loads.map((l) => l.occurrences.length))
  return loads.map((l) => ({
    date: l.date,
    count: l.occurrences.length,
    level: l.occurrences.length ? Math.ceil((l.occurrences.length / most) * 4) : 0,
  }))
})

function scrollToFraction(fraction: number) {
  const el = scroller.value
  const head = timeHead.value
  if (!el || !head) return
  const area = el.clientWidth - (corner.value?.offsetWidth ?? 0)
  const distance = Math.max(0, fraction * head.offsetWidth - area / 2)
  el.scrollLeft = isRtl(el) ? -distance : distance
}

function onMinimapClick(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const rtl = isRtl(e.currentTarget as HTMLElement)
  scrollToFraction((rtl ? rect.right - e.clientX : e.clientX - rect.left) / rect.width)
}

// --- header tiers -----------------------------------------------------------------------------------

const tierRows = computed(() =>
  (props.settings.headerTiers ?? []).map((unit) =>
    headerTiers(props.days, unit, ctx.options.value.locale, ctx.options.value.weekStart),
  ),
)

// --- dependencies -----------------------------------------------------------------------------------

/** Lines for arrows between events on rendered rows, in % of the width and px of the height. */
const dependencyLines = computed(() => {
  if (!props.settings.dependencies) return []
  const places = new Map<string, { left: number; right: number; y: number }>()
  const { eventHeight } = config.value
  for (const row of rows.value) {
    for (const item of row.items) {
      const top = row.top + parseFloat(eventTop(item.lane)) + eventHeight / 2
      places.set(item.occurrence.key, { left: item.left, right: item.left + item.width, y: top })
    }
  }
  const rtl = !!root.value && isRtl(root.value)
  const x = (fraction: number) => `${(rtl ? 1 - fraction : fraction) * 100}%`
  const seen = new Set<string>()
  const occurrences = rows.value
    .flatMap((r) => r.items.map((i) => i.occurrence))
    .filter((o) => !seen.has(o.key) && !!seen.add(o.key))
  return dependencyLinks(occurrences, ctx.accessors.value).flatMap((link) => {
    const a = places.get(link.from.key)
    const b = places.get(link.to.key)
    if (!a || !b) return []
    const mid = x(Math.max(a.right, Math.min(b.left, a.right)))
    return [{ key: link.key, x1: x(a.right), y1: a.y, mid, x2: x(b.left), y2: b.y, link }]
  })
})

const rootStyle = computed(() => ({
  '--orb-tl-days': dayList.value.length,
  '--orb-tl-slots': slotCount.value,
  '--orb-tl-slot-width': `${props.settings.slotWidth}px`,
  '--orb-tl-event-height': `${config.value.eventHeight}px`,
  ...(areaWidth.value !== undefined
    ? { '--orb-tl-resource-width': `${areaWidth.value}px` }
    : props.settings.resourceAreaWidth
      ? { '--orb-tl-resource-width': props.settings.resourceAreaWidth }
      : {}),
  ...(props.settings.resourceColumns?.length
    ? { '--orb-tl-resource-grid': resourceGrid.value }
    : {}),
}))

// --- virtual rows --------------------------------------------------------------------------------

const scroller = ref<HTMLElement>()
const body = ref<HTMLElement>()
const timeHead = ref<HTMLElement>()
const scrollMargin = ref(0)

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scroller.value ?? null,
    estimateSize: (i: number) => rows.value[i]?.height ?? props.settings.rowMinHeight,
    getItemKey: (i: number) => rows.value[i]?.key ?? i,
    overscan: 6,
    scrollMargin: scrollMargin.value,
  })),
)

// Heights are known exactly; tell the virtualizer when lanes change.
watch(
  () => rows.value.map((r) => r.height).join(),
  () => virtualizer.value.measure(),
)

const rendered = computed(() => {
  if (!props.settings.virtual) return rows.value.map((row) => ({ row, start: row.top }))
  return virtualizer.value
    .getVirtualItems()
    .map((item) => ({ row: rows.value[item.index]!, start: item.start - scrollMargin.value }))
    .filter((r) => r.row)
})

function measureMargin() {
  if (body.value) scrollMargin.value = body.value.offsetTop
}

// --- labels and clicks ---------------------------------------------------------------------------

function labelScope(resource: ResourceNode<unknown>): ResourceLabelSlotProps {
  return {
    view: props.view,
    resource,
    title: resource.title,
    depth: resource.depth,
    expanded: !ctx.collapsedResources.value.has(resource.id),
    hasChildren: resource.childIds.length > 0,
    toggle: () => ctx.toggleResource(resource.id),
  }
}

function onResourceClick(resource: ResourceNode<unknown>, e: MouseEvent) {
  ctx.emit('resource-click', {
    resource,
    view: props.view,
    nativeEvent: e,
    element: e.currentTarget as HTMLElement,
  })
}

function onDateClick(day: TimelineDay, e: MouseEvent) {
  ctx.openDate(day.date, props.view, e)
}

type SlotEmit = 'slot-click' | 'slot-dblclick' | 'slot-contextmenu'

function laneFraction(clientX: number): number {
  const rect = timeHead.value!.getBoundingClientRect()
  const fromStart = isRtl(timeHead.value!) ? rect.right - clientX : clientX - rect.left
  return Math.min(Math.max(fromStart / rect.width, 0), 1)
}

function onLane(name: SlotEmit, row: TimelineRow<unknown>, e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.orb-event')) return
  if (name === 'slot-click') {
    const at = hitTest(e.clientX, e.clientY)
    if (at && interaction.placeArmed(at, e, snapMinutes())) return
  }
  ctx.emit(name, {
    view: props.view,
    ...slotAt(laneFraction(e.clientX)),
    resourceId: row.resource.id,
    nativeEvent: e,
    element: e.currentTarget as HTMLElement,
  })
}

function onEmptyPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.orb-event')) return
  interaction.pointerDownOnSlot(e, props.view)
}

// --- hit testing ---------------------------------------------------------------------------------

const root = ref<HTMLElement>()
const corner = ref<HTMLElement>()

function hitTest(x: number, y: number): Hit | null {
  if (!root.value?.isConnected || !body.value || !timeHead.value || !rows.value.length) return null
  const outer = scroller.value!.getBoundingClientRect()
  if (x < outer.left || x > outer.right || y < outer.top || y > outer.bottom) return null
  const { date, minute } = axis.value.at(laneFraction(x))
  const row = rows.value[rowAt(y - body.value.getBoundingClientRect().top)]!
  return {
    zone: 'timeline',
    date,
    minute,
    resourceId: props.settings.byEvent ? undefined : row.resource.id,
  }
}

let unregister: (() => void) | undefined
onMounted(() => {
  unregister = interaction.registerSurface({
    hitTest,
    scrollElement: () => scroller.value,
    scrollArea: () => {
      const rect = scroller.value?.getBoundingClientRect()
      const axis = timeHead.value?.getBoundingClientRect()
      if (!rect || !axis) return undefined
      // Not under the sticky time head, nor under the sticky resource column on its side.
      const resources = corner.value?.offsetWidth ?? 0
      const rtl = isRtl(scroller.value!)
      return {
        left: rtl ? rect.left : rect.left + resources,
        top: axis.bottom,
        right: rtl ? rect.right - resources : rect.right,
        bottom: rect.bottom,
      }
    },
    snapMinutes,
    // Steps count from the day start, so 420-minute half days begin at 06:00 and 13:00.
    snapOrigin: () => (daySlots.value ? 0 : axis.value.dayStartMinute),
    scrollToMinute: (minute) => scrollToTime(minute),
  })
})
onBeforeUnmount(() => unregister?.())

// --- initial scroll position ---------------------------------------------------------------------

/** Scrolls horizontally to a time (default the scroll time) of today, or else the first day. */
function scrollToTime(
  minute = parseTimeOfDay(props.settings.scrollTime, ctx.options.value.scrollMinute),
) {
  const el = scroller.value
  const head = timeHead.value
  if (!el || !head || daySlots.value) return
  const today = props.days.find((d) => d.equals(ctx.today.value)) ?? props.days[0]
  if (!today) return
  const tz = ctx.options.value.timeZone
  const ms = today.toZonedDateTime({ timeZone: tz }).add({ minutes: minute }).epochMilliseconds
  const distance = Math.max(0, axis.value.position(ms) * head.offsetWidth)
  el.scrollLeft = isRtl(el) ? -distance : distance
}

let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  measureMargin()
  scrollToTime()
  measureX()
  measureY()
  measureViewport()
  if (typeof ResizeObserver !== 'undefined' && body.value?.previousElementSibling) {
    resizeObserver = new ResizeObserver(() => {
      measureMargin()
      measureX()
    })
    resizeObserver.observe(body.value.previousElementSibling)
  }
})
onBeforeUnmount(() => resizeObserver?.disconnect())
watch(
  () => props.days[0]?.toString(),
  () =>
    nextTick(() => {
      scrollToTime()
      measureX()
    }),
)

// --- visible-resources-change ---------------------------------------------------------------------

watch(
  () => {
    const range = ctx.range.value
    const win = ctx.window.value
    if (!range || !win) return ''
    return `${range.start}|${range.end}|${rendered.value.map((r) => r.row.key).join(',')}`
  },
  (key) => {
    const range = ctx.range.value
    const win = ctx.window.value
    if (!key || !range || !win) return
    ctx.emit('visible-resources-change', {
      view: props.view,
      resourceIds: rendered.value.map((r) => r.row.resource.id),
      start: range.start,
      end: range.end,
      startMs: win.startMs,
      endMs: win.endMs,
    })
  },
  { flush: 'post', immediate: true },
)

const SHADE_PART = {
  closed: 'closedTime',
  blocked: 'blockedTime',
  background: 'backgroundEvent',
  suggestion: 'suggestion',
  band: 'timeZoneBand',
} as const
const SHADE_SLOT = {
  closed: 'closed-time',
  blocked: 'blocked-time',
  background: 'background-event',
  suggestion: 'suggestion',
  band: 'time-zone-band',
} as const

function onShadeClick(shade: AvailabilityShade, e: MouseEvent) {
  if (shade.suggestion)
    ctx.emit('suggestion-click', { suggestion: shade.suggestion, nativeEvent: e })
}

/** Closed hours, blocked times and background events on a row, per visible day. */
function rowShades(resourceId: ResourceId) {
  if (!ctx.availability.hasShades.value) return []
  const a = axis.value
  const tz = ctx.options.value.timeZone
  const whole = daySlots.value
  return props.days.flatMap((date) => {
    const from = whole ? 0 : a.dayStartMinute
    const to = whole ? 1440 : a.dayEndMinute
    return (
      ctx.availability
        .shadesFor(date, resourceId, from, to)
        // A day column can only show a closed day as a whole.
        .filter((s) => !whole || s.kind !== 'closed' || (s.start === 0 && s.end === 1440))
        .flatMap((shade) => {
          const left = a.position(zonedAtMinute(date, shade.start, tz).epochMilliseconds)
          const right =
            shade.end >= 1440 && whole
              ? a.position(date.add({ days: 1 }).toZonedDateTime(tz).epochMilliseconds)
              : a.position(zonedAtMinute(date, shade.end, tz).epochMilliseconds)
          return right > left
            ? [{ ...shade, key: `${date}-${shade.key}`, date, left, width: right - left }]
            : []
        })
    )
  })
}

function eventTop(lane: number) {
  const { rowPadding, eventHeight, laneGap } = config.value
  return `${rowPadding + lane * (eventHeight + laneGap)}px`
}
</script>

<template>
  <div
    ref="root"
    class="orb-tl"
    v-bind="ctx.part('timeline')"
    role="group"
    :aria-label="ctx.title.value"
    :class="{
      'orb-tl--minimap': settings.minimap,
      'orb-tl--zoom': settings.zoomLevels?.length,
      'orb-tl--resizing': resizingArea,
    }"
    :style="rootStyle"
  >
    <span
      v-if="settings.resourceAreaResizable"
      class="orb-tl__resizer"
      v-bind="ctx.part('resourceResizer')"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-label="messages.resources"
      :aria-valuenow="Math.round(areaWidth ?? corner?.offsetWidth ?? 192)"
      :aria-valuemin="80"
      @pointerdown="onResizerDown"
      @keydown="onResizerKeydown"
    />
    <div v-if="settings.zoomLevels?.length" class="orb-tl__zoom" v-bind="ctx.part('zoomControl')">
      <RenderSlot
        :fn="resolve('zoom-control')"
        :scope="{
          level: settings.zoomLevel ?? 0,
          levels: settings.zoomLevels.length,
          setLevel: setZoom,
        }"
      >
        <button
          type="button"
          class="orb-button orb-button--icon"
          aria-label="Zoom out"
          :disabled="(settings.zoomLevel ?? 0) <= 0"
          @click="setZoom((settings.zoomLevel ?? 0) - 1)"
        >
          −
        </button>
        <button
          type="button"
          class="orb-button orb-button--icon"
          aria-label="Zoom in"
          :disabled="(settings.zoomLevel ?? 0) >= settings.zoomLevels.length - 1"
          @click="setZoom((settings.zoomLevel ?? 0) + 1)"
        >
          +
        </button>
      </RenderSlot>
    </div>
    <div ref="scroller" class="orb-tl__scroller" @scroll.passive="onScrollX" @wheel="onWheel">
      <div class="orb-tl__inner">
        <div class="orb-tl__head">
          <div ref="corner" class="orb-tl__corner" v-bind="ctx.part('timelineCorner')">
            <RenderSlot
              :fn="resolve('resource-area-header')"
              :scope="{ view, label: messages.resources }"
            >
              <input
                v-if="settings.resourceSearch"
                class="orb-tl__search"
                v-bind="ctx.part('resourceSearch')"
                type="search"
                :placeholder="messages.searchResources"
                :aria-label="messages.searchResources"
                :value="ctx.resourceQuery.value"
                @input="ctx.resourceQuery.value = ($event.target as HTMLInputElement).value"
              />
              <div v-else-if="settings.resourceColumns?.length" class="orb-tl__resource-columns">
                <span>{{ messages.resources }}</span>
                <span v-for="column in settings.resourceColumns" :key="column.key">
                  {{ column.label }}
                </span>
              </div>
              <template v-else>{{ messages.resources }}</template>
            </RenderSlot>
          </div>
          <div ref="timeHead" class="orb-tl__time-head">
            <div
              v-for="(cells, ti) in tierRows"
              :key="ti"
              class="orb-tl__days-row orb-tl__tier-row"
            >
              <div
                v-for="cell in cells"
                :key="cell.key"
                class="orb-tl__tier"
                v-bind="ctx.part('timelineTier', { cell })"
                :style="{ gridColumn: `${cell.start + 1} / span ${cell.span}` }"
              >
                <RenderSlot
                  :fn="resolve('timeline-tier')"
                  :scope="{ view, unit: cell.unit, date: cell.date, label: cell.label }"
                >
                  <span class="orb-tl__tier-label">{{ cell.label }}</span>
                </RenderSlot>
              </div>
            </div>
            <div class="orb-tl__days-row">
              <div
                v-for="day in dayList"
                :key="day.key"
                class="orb-tl__day-heading"
                v-bind="ctx.part('timelineDayHeading', { day })"
                :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
              >
                <button
                  type="button"
                  class="orb-tl__day-button"
                  :aria-current="day.isToday ? 'date' : undefined"
                  @click="onDateClick(day, $event)"
                >
                  <RenderSlot
                    :fn="resolve('timeline-header')"
                    :scope="{
                      view,
                      date: day.date,
                      minute: undefined,
                      label: day.label,
                      isToday: day.isToday,
                    }"
                  >
                    {{ day.label }}
                  </RenderSlot>
                </button>
              </div>
            </div>
            <div v-if="!daySlots" class="orb-tl__slots-row" aria-hidden="true">
              <template v-for="{ key, column, day, slot } in visibleSlots" :key="key">
                <div
                  class="orb-tl__slot-heading"
                  v-bind="ctx.part('timelineSlotHeading', { day, slot })"
                  :class="{ 'is-labelled': !!slot.label }"
                  :style="{ gridColumn: column }"
                >
                  <RenderSlot
                    v-if="slot.label"
                    :fn="resolve('timeline-header')"
                    :scope="{
                      view,
                      date: day.date,
                      minute: slot.minute,
                      label: slot.label,
                      isToday: day.isToday,
                    }"
                  >
                    {{ slot.label }}
                  </RenderSlot>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div ref="body" class="orb-tl__body" :style="{ height: `${totalHeight}px` }">
          <svg v-if="dependencyLines.length" class="orb-tl__dependencies" aria-hidden="true">
            <defs>
              <marker
                :id="`${view}-arrow`"
                viewBox="0 0 6 6"
                refX="5"
                refY="3"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0 0L6 3L0 6z" fill="currentColor" />
              </marker>
            </defs>
            <g
              v-for="line in dependencyLines"
              :key="line.key"
              v-bind="ctx.part('dependency', { from: line.link.from, to: line.link.to })"
            >
              <line :x1="line.x1" :y1="line.y1" :x2="line.mid" :y2="line.y1" />
              <line :x1="line.mid" :y1="line.y1" :x2="line.mid" :y2="line.y2" />
              <line
                :x1="line.mid"
                :y1="line.y2"
                :x2="line.x2"
                :y2="line.y2"
                :marker-end="`url(#${view}-arrow)`"
              />
            </g>
          </svg>
          <div class="orb-tl__day-columns" aria-hidden="true">
            <div
              v-for="day in dayList"
              :key="day.key"
              class="orb-tl__day-column"
              :class="{
                'is-today': day.isToday,
                'is-past': day.isPast,
                'is-weekend': day.isWeekend,
              }"
            />
            <div
              v-if="ctx.options.value.nowIndicator && nowPosition !== null"
              class="orb-tl__now"
              v-bind="ctx.part('nowIndicator')"
              :style="{ insetInlineStart: pct(nowPosition) }"
            >
              <RenderSlot
                :fn="resolve('now-indicator')"
                :scope="{ now: ctx.now.value, label: '' }"
              />
            </div>
          </div>

          <div
            v-for="{ row, start } in rendered"
            :key="row.key"
            class="orb-tl__row"
            v-bind="ctx.part('timelineRow', { resource: row.resource })"
            :class="{
              'orb-tl__row--group': row.resource.childIds.length > 0,
              'orb-tl__row--reorder-before':
                reorder?.target === row.resource.id && reorder.position === 'before',
              'orb-tl__row--reorder-after':
                reorder?.target === row.resource.id && reorder.position === 'after',
            }"
            :style="{ height: `${row.height}px`, transform: `translateY(${start}px)` }"
            role="group"
            :aria-label="row.resource.title"
          >
            <div
              class="orb-tl__label"
              v-bind="ctx.part('resourceLabel', { resource: row.resource })"
              :style="{ '--orb-tl-depth': row.resource.depth }"
              @pointerdown="onLabelPointerDown($event, row.resource)"
            >
              <button
                v-if="row.resource.childIds.length || row.resource.lazy"
                type="button"
                class="orb-tl__toggle"
                v-bind="ctx.part('resourceToggle', { resource: row.resource })"
                :class="{ 'is-loading': ctx.loadingResources.value.has(row.resource.id) }"
                :aria-expanded="
                  !row.resource.lazy && !ctx.collapsedResources.value.has(row.resource.id)
                "
                :aria-label="row.resource.title"
                @click="ctx.toggleResource(row.resource.id)"
              />
              <span v-else class="orb-tl__toggle-space" />
              <RenderSlot :fn="resolve('resource-label')" :scope="labelScope(row.resource)">
                <span
                  class="orb-tl__resource-title"
                  :style="
                    row.resource.color
                      ? { '--orb-tl-resource-color': row.resource.color }
                      : undefined
                  "
                  @click="onResourceClick(row.resource, $event)"
                >
                  {{ row.resource.title }}
                </span>
              </RenderSlot>
              <span
                v-for="column in settings.resourceColumns"
                :key="column.key"
                class="orb-tl__resource-cell"
                v-bind="ctx.part('resourceCell', { column, resource: row.resource })"
              >
                <RenderSlot
                  :fn="resolve('resource-column')"
                  :scope="{
                    view,
                    column,
                    resource: row.resource,
                    value: columnValue(column, row.resource),
                  }"
                >
                  {{ columnValue(column, row.resource) }}
                </RenderSlot>
              </span>
            </div>
            <div
              class="orb-tl__lane"
              v-bind="ctx.part('timelineLane', { resource: row.resource })"
              @pointerdown="onEmptyPointerDown"
              @click="onLane('slot-click', row, $event)"
              @dblclick="onLane('slot-dblclick', row, $event)"
              @contextmenu="onLane('slot-contextmenu', row, $event)"
            >
              <div
                v-for="load in rowLoad(row.resource)"
                :key="load.key"
                class="orb-tl__load"
                :class="`orb-tl__load--level-${load.level}`"
                v-bind="ctx.part('resourceLoad', { load, resource: row.resource })"
                :style="{ insetInlineStart: pct(load.left), width: pct(load.width) }"
              >
                <RenderSlot
                  :fn="resolve('resource-load')"
                  :scope="{
                    view,
                    date: load.date,
                    resource: row.resource,
                    minutes: load.minutes,
                    capacity: load.capacity,
                    ratio: load.ratio,
                    occurrences: load.occurrences,
                  }"
                >
                  <span v-if="load.minutes" class="orb-tl__load-text">
                    {{ Math.round(load.ratio * 100) }}%
                  </span>
                </RenderSlot>
              </div>
              <div
                v-for="c in countsOnly ? dayCounts(row) : []"
                :key="c.key"
                class="orb-tl__count"
                v-bind="ctx.part('dayCount', { resource: row.resource, date: c.date })"
                :style="{ insetInlineStart: pct(c.left), width: pct(c.width) }"
              >
                <RenderSlot
                  :fn="resolve('day-count')"
                  :scope="{
                    view,
                    date: c.date,
                    resourceId: row.resource.id,
                    count: c.count,
                    occurrences: c.occurrences,
                  }"
                >
                  {{ c.count }}
                </RenderSlot>
              </div>
              <div
                v-for="shade in rowShades(row.resource.id)"
                :key="shade.key"
                class="orb-shade"
                :class="`orb-shade--${shade.kind}`"
                v-bind="ctx.part(SHADE_PART[shade.kind], { shade, resource: row.resource })"
                @click.stop="onShadeClick(shade, $event)"
                :style="{
                  insetInlineStart: pct(shade.left),
                  width: pct(shade.width),
                  ...(shade.color ? { '--orb-background-event-color': shade.color } : {}),
                }"
                aria-hidden="true"
              >
                <RenderSlot
                  :fn="resolve(SHADE_SLOT[shade.kind])"
                  :scope="{
                    view,
                    date: shade.date,
                    resourceId: row.resource.id,
                    title: shade.title,
                    color: shade.color,
                    occurrence: shade.occurrence,
                  }"
                >
                  <span v-if="shade.title" class="orb-shade__title">{{ shade.title }}</span>
                </RenderSlot>
              </div>
              <template v-for="overlay in overlays.get(row.resource.id)" :key="overlay.kind">
                <div
                  v-if="overlay.kind === 'selection'"
                  class="orb-tl__selection"
                  v-bind="ctx.part('selection')"
                  :style="{ insetInlineStart: pct(overlay.left), width: pct(overlay.width) }"
                  aria-hidden="true"
                >
                  <RenderSlot :fn="resolve('selection')" :scope="selectionScope" />
                </div>
                <EventItem
                  v-else
                  class="orb-tl__mirror"
                  :occurrence="overlay.occurrence"
                  variant="timeline"
                  :view="view"
                  :resolve="resolve"
                  mirror
                  :valid="overlay.valid"
                  :style="{
                    insetInlineStart: pct(overlay.left),
                    width: pct(overlay.width),
                    top: eventTop(0),
                  }"
                />
              </template>
              <EventItem
                v-for="item in visibleItems(
                  countsOnly ? row.items.filter((i) => i.occurrence.allDay) : row.items,
                  row.top,
                )"
                :key="item.occurrence.key"
                :occurrence="item.occurrence"
                variant="timeline"
                :view="view"
                :resolve="resolve"
                :is-start="item.isStart"
                :is-end="item.isEnd"
                :resource-id="row.resource.id"
                :snap-minutes="snapMinutes()"
                :style="
                  stableStyle(item, (i) => ({
                    insetInlineStart: pct(i.left),
                    width: pct(i.width),
                    top: eventTop(i.lane),
                  }))
                "
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="settings.minimap"
      class="orb-tl__minimap"
      v-bind="ctx.part('minimap')"
      @click="onMinimapClick"
    >
      <RenderSlot
        :fn="resolve('minimap')"
        :scope="{
          days: minimapDays,
          from: viewport.from,
          to: viewport.to,
          scrollTo: scrollToFraction,
        }"
      >
        <span
          v-for="day in minimapDays"
          :key="day.date.toString()"
          class="orb-tl__minimap-day"
          :class="`orb-tl__minimap-day--level-${day.level}`"
          aria-hidden="true"
        />
        <span
          class="orb-tl__minimap-view"
          :style="{ insetInlineStart: pct(viewport.from), width: pct(viewport.to - viewport.from) }"
          aria-hidden="true"
        />
      </RenderSlot>
    </div>
  </div>
</template>
