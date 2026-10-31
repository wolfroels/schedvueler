<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { type Hit, type ResourceNode, type Temporal } from '../core'
import { parseTimeOfDay, useSchedulerContext } from '../composables/context'
import type { SlotResolver } from '../composables/useSchedulerView'
import { visibleHours } from '../composables/validate'
import { useTimeline, type TimelineDay, type TimelineRow } from '../composables/useTimeline'
import type { ResourceLabelSlotProps } from '../types'
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

const ctx = useSchedulerContext()
const interaction = ctx.interaction
const messages = computed(() => ctx.options.value.messages)

/** Rows: visible resources (collapsed groups hide their children), optionally filtered. */
const rowResources = computed(() => {
  const ids = props.settings.resourceIds
  const visible = ctx.visibleResources.value
  if (!ids) return visible
  const wanted = new Set(ids)
  return visible.filter((r) => wanted.has(r.id))
})

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
    eventHeight: s.eventHeight,
    laneGap: 2,
    rowPadding: 4,
    rowMinHeight: s.rowMinHeight,
    // About 24px at the configured slot width.
    minEventWidth: 24 / (s.slotWidth * props.days.length * slotsPerDay(s)),
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

const rootStyle = computed(() => ({
  '--orb-tl-days': dayList.value.length,
  '--orb-tl-slots': slotCount.value,
  '--orb-tl-slot-width': `${props.settings.slotWidth}px`,
  '--orb-tl-event-height': `${props.settings.eventHeight}px`,
  ...(props.settings.resourceAreaWidth
    ? { '--orb-tl-resource-width': props.settings.resourceAreaWidth }
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
  return { zone: 'timeline', date, minute, resourceId: row.resource.id }
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
  })
})
onBeforeUnmount(() => unregister?.())

// --- initial scroll position ---------------------------------------------------------------------

/** Scrolls horizontally to the scroll time of today (or the first day). */
function scrollToTime() {
  const el = scroller.value
  const head = timeHead.value
  if (!el || !head || daySlots.value) return
  const minute = parseTimeOfDay(props.settings.scrollTime, ctx.options.value.scrollMinute)
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
  if (typeof ResizeObserver !== 'undefined' && body.value?.previousElementSibling) {
    resizeObserver = new ResizeObserver(measureMargin)
    resizeObserver.observe(body.value.previousElementSibling)
  }
})
onBeforeUnmount(() => resizeObserver?.disconnect())
watch(
  () => props.days[0]?.toString(),
  () => nextTick(scrollToTime),
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
    :style="rootStyle"
  >
    <div ref="scroller" class="orb-tl__scroller">
      <div class="orb-tl__inner">
        <div class="orb-tl__head">
          <div ref="corner" class="orb-tl__corner" v-bind="ctx.part('timelineCorner')">
            <RenderSlot
              :fn="resolve('resource-area-header')"
              :scope="{ view, label: messages.resources }"
            >
              {{ messages.resources }}
            </RenderSlot>
          </div>
          <div ref="timeHead" class="orb-tl__time-head">
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
              <template v-for="day in dayList" :key="day.key">
                <div
                  v-for="slot in slots"
                  :key="slot.minute"
                  class="orb-tl__slot-heading"
                  v-bind="ctx.part('timelineSlotHeading', { day, slot })"
                  :class="{ 'is-labelled': !!slot.label }"
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
            :class="{ 'orb-tl__row--group': row.resource.childIds.length > 0 }"
            :style="{ height: `${row.height}px`, transform: `translateY(${start}px)` }"
            role="group"
            :aria-label="row.resource.title"
          >
            <div
              class="orb-tl__label"
              v-bind="ctx.part('resourceLabel', { resource: row.resource })"
              :style="{ '--orb-tl-depth': row.resource.depth }"
            >
              <button
                v-if="row.resource.childIds.length"
                type="button"
                class="orb-tl__toggle"
                v-bind="ctx.part('resourceToggle', { resource: row.resource })"
                :aria-expanded="!ctx.collapsedResources.value.has(row.resource.id)"
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
            </div>
            <div
              class="orb-tl__lane"
              v-bind="ctx.part('timelineLane', { resource: row.resource })"
              @pointerdown="onEmptyPointerDown"
              @click="onLane('slot-click', row, $event)"
              @dblclick="onLane('slot-dblclick', row, $event)"
              @contextmenu="onLane('slot-contextmenu', row, $event)"
            >
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
                v-for="item in row.items"
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
  </div>
</template>
