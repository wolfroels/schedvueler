<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  computeSelection,
  formatDate,
  leafResources,
  timeGridLayouts,
  type Hit,
  type ResourceNode,
  type Temporal,
} from '../core'
import { parseTimeOfDay, useSchedulerContext } from '../composables/context'
import type { SlotResolver } from '../composables/useSchedulerView'
import {
  useTimeGrid,
  type TimeGridColumn,
  type TimeGridSlotRow,
  type AllDayEventLayout,
  type TimedEventLayout,
} from '../composables/useTimeGrid'
import EventItem from './EventItem.vue'
import { stableStyle } from './stable-style'
import { RenderSlot } from './RenderSlot'
import type { TimeGridViewProps } from './view-props'

const props = defineProps<{
  view: string
  days: readonly Temporal.PlainDate[]
  settings: TimeGridViewProps
  resolve: SlotResolver
}>()

const ctx = useSchedulerContext()
const interaction = ctx.interaction

/** Resources shown as columns: all leaf resources for `resources`, or the listed ids. */
const columnResources = computed(() => {
  const option = props.settings.resources
  if (!option) return undefined
  if (option === true) return leafResources(ctx.resources.value)
  const map = ctx.resourceMap.value
  return option.flatMap((id) => map.get(id) ?? [])
})

const config = computed(() => {
  const o = ctx.options.value
  const s = props.settings
  const layout = s.eventLayout
  return {
    days: props.days,
    slotDuration: s.slotDuration ?? o.slotDuration,
    slotLabelInterval: s.slotLabelInterval ?? o.slotLabelInterval,
    dayStartMinute: parseTimeOfDay(s.dayStartTime, o.dayStartMinute),
    dayEndMinute: parseTimeOfDay(s.dayEndTime, o.dayEndMinute),
    layout: layout
      ? typeof layout === 'function'
        ? layout
        : timeGridLayouts[layout]
      : o.eventLayout,
    allDaySlot: s.allDaySlot ?? true,
    resources: columnResources.value,
    groupBy: s.groupBy ?? 'resource',
  }
})

const { columns, slots, allDay, timed, overlays, allDaySelection, nowLine, slotRange, dayRange } =
  useTimeGrid(ctx, config)

const timeSlotSlot = computed(() => props.resolve('time-slot'))
const snapMinutes = () => ctx.options.value.raw.snapDuration ?? config.value.slotDuration

interface HeaderCell {
  key: string
  kind: 'day' | 'resource'
  /** First column (0-based) and number of columns covered. */
  col: number
  span: number
  column: TimeGridColumn
}

/**
 * Header rows. Without resources: one row of days. With resources: the outer grouping on top,
 * spanning its columns, and the inner one below (left out when there is only one day).
 */
const headerRows = computed<HeaderCell[][]>(() => {
  const cols = columns.value
  const cell = (kind: HeaderCell['kind'], col: number, span: number): HeaderCell => ({
    key: `${kind}:${cols[col]!.key}`,
    kind,
    col,
    span,
    column: cols[col]!,
  })
  const resources = config.value.resources
  if (!resources?.length) return [cols.map((_, i) => cell('day', i, 1))]
  const dayCount = props.days.length
  const byResource = config.value.groupBy !== 'date'
  const groupSize = byResource ? dayCount : resources.length
  const outer: HeaderCell[] = []
  const inner: HeaderCell[] = []
  for (let i = 0; i < cols.length; i += groupSize) {
    outer.push(cell(byResource ? 'resource' : 'day', i, groupSize))
    for (let j = i; j < i + groupSize; j++) inner.push(cell(byResource ? 'day' : 'resource', j, 1))
  }
  return byResource && dayCount === 1 ? [outer] : [outer, inner]
})
const messages = computed(() => ctx.options.value.messages)
const pct = (fraction: number) => `${fraction * 100}%`

function eventStyle(item: TimedEventLayout<unknown>) {
  return stableStyle(item, (i) => ({
    top: pct(i.top),
    height: pct(i.height),
    left: pct(i.left),
    width: `calc(${pct(i.width)} - var(--orb-event-gap))`,
    zIndex: i.order + 1,
  }))
}

function allDayStyle(item: AllDayEventLayout<unknown>) {
  return stableStyle(item, (i) => ({
    gridColumn: `${i.startCol + 1} / ${i.endCol + 1}`,
    gridRow: i.row + 1,
  }))
}

function dateLabel(date: Temporal.PlainDate) {
  return formatDate(date, ctx.options.value.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function columnLabel(col: TimeGridColumn) {
  const date = dateLabel(col.date)
  return col.resource ? `${col.resource.title}, ${date}` : date
}

function resourceScope(resource: ResourceNode<unknown>) {
  return {
    view: props.view,
    resource,
    title: resource.title,
    depth: resource.depth,
    expanded: true,
    hasChildren: false,
    toggle: () => {},
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

// --- clicks ----------------------------------------------------------------------------------

type SlotEmit = 'slot-click' | 'slot-dblclick' | 'slot-contextmenu'

function onSlot(name: SlotEmit, col: TimeGridColumn, slot: TimeGridSlotRow, e: MouseEvent) {
  ctx.emit(name, {
    view: props.view,
    date: col.date,
    ...slotRange(col.date, slot.startMinute, slot.endMinute),
    allDay: false,
    resourceId: col.resourceId,
    nativeEvent: e,
    element: e.currentTarget as HTMLElement,
  })
}

function onAllDay(name: SlotEmit, col: TimeGridColumn, e: MouseEvent) {
  ctx.emit(name, {
    view: props.view,
    date: col.date,
    ...dayRange(col.date),
    allDay: true,
    resourceId: col.resourceId,
    nativeEvent: e,
    element: e.currentTarget as HTMLElement,
  })
}

function onDateClick(col: TimeGridColumn, e: MouseEvent) {
  ctx.openDate(col.date, props.view, e)
}

/** Pointerdown on empty space starts a selection (when enabled); events handle their own. */
function onEmptyPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.orb-event')) return
  interaction.pointerDownOnSlot(e, props.view)
}

// --- hit testing for drag, resize and select ---------------------------------------------------

const root = ref<HTMLElement>()
const scroller = ref<HTMLElement>()
const head = ref<HTMLElement>()
const body = ref<HTMLElement>()
const allDayEl = ref<HTMLElement>()
const columnEls: HTMLElement[] = []

function setColumnEl(el: unknown, index: number) {
  if (el) columnEls[index] = el as HTMLElement
}

function hitTest(x: number, y: number): Hit | null {
  const cols = columnEls.slice(0, columns.value.length)
  if (!cols.length || !root.value?.isConnected) return null
  const rects = cols.map((c) => c.getBoundingClientRect())
  if (x < rects[0]!.left || x > rects[rects.length - 1]!.right) return null
  let index = rects.findIndex((r) => x >= r.left && x < r.right)
  if (index < 0) index = rects.length - 1
  const { date, resourceId } = columns.value[index]!

  const allDayRect = allDayEl.value?.getBoundingClientRect()
  if (allDayRect && y >= allDayRect.top && y < allDayRect.bottom)
    return { zone: 'all-day', date, resourceId }

  const rect = rects[index]!
  const { dayStartMinute, dayEndMinute } = config.value
  const fraction = Math.min(Math.max((y - rect.top) / rect.height, 0), 0.9999)
  const minute = dayStartMinute + fraction * (dayEndMinute - dayStartMinute)
  return { zone: 'time', date, minute, resourceId }
}

let unregister: (() => void) | undefined
onMounted(() => {
  unregister = interaction.registerSurface({
    hitTest,
    scrollElement: () => scroller.value,
    snapMinutes,
  })
})
onBeforeUnmount(() => unregister?.())

// --- keyboard: roving focus over the slots ---------------------------------------------------

const focusCell = shallowRef<{ col: number; slot: number }>()
const selectionAnchor = shallowRef<Hit>()

const defaultFocus = computed(() => {
  const col = Math.max(
    0,
    columns.value.findIndex((c) => c.isToday),
  )
  const minute = parseTimeOfDay(props.settings.scrollTime, ctx.options.value.scrollMinute)
  const slot = Math.max(
    0,
    slots.value.findIndex((s) => s.endMinute > minute),
  )
  return { col, slot }
})

const activeCell = computed(() => {
  const f = focusCell.value
  return f && f.col < columns.value.length && f.slot < slots.value.length ? f : defaultFocus.value
})

function slotHit(col: number, slot: number): Hit {
  return {
    zone: 'time',
    date: columns.value[col]!.date,
    minute: slots.value[slot]!.startMinute,
    resourceId: columns.value[col]!.resourceId,
  }
}

function focusSlot(col: number, slot: number) {
  focusCell.value = { col, slot }
  nextTick(() => root.value?.querySelector<HTMLElement>(`[data-cell="${col}-${slot}"]`)?.focus())
}

function onSlotKeydown(e: KeyboardEvent, col: number, slot: number) {
  const lastCol = columns.value.length - 1
  const lastSlot = slots.value.length - 1
  let next = { col, slot }
  switch (e.key) {
    case 'ArrowUp':
      next.slot = Math.max(0, slot - 1)
      break
    case 'ArrowDown':
      next.slot = Math.min(lastSlot, slot + 1)
      break
    case 'ArrowLeft':
      if (col === 0 && !e.shiftKey) {
        ctx.prev()
        next = { col: lastCol, slot }
      } else next.col = Math.max(0, col - 1)
      break
    case 'ArrowRight':
      if (col === lastCol && !e.shiftKey) {
        ctx.next()
        next = { col: 0, slot }
      } else next.col = Math.min(lastCol, col + 1)
      break
    case 'Home':
      next.slot = 0
      break
    case 'End':
      next.slot = lastSlot
      break
    case 'Enter':
    case ' ': {
      e.preventDefault()
      const sel = interaction.selection.value
      if (selectionAnchor.value && sel && sel.view === props.view) {
        interaction.setSelection(props.view, sel.times, e)
        selectionAnchor.value = undefined
      } else {
        ;(e.currentTarget as HTMLElement).click()
      }
      return
    }
    default:
      return
  }
  e.preventDefault()
  if (e.shiftKey && interaction.selectable) {
    // Shift + arrows extends a selection from where it started; Enter confirms it.
    const anchor = selectionAnchor.value ?? slotHit(col, slot)
    selectionAnchor.value = anchor
    const times = computeSelection(anchor, slotHit(next.col, next.slot), {
      timeZone: ctx.options.value.timeZone,
      snapMinutes: snapMinutes(),
      defaultDurationMinutes: 60,
    })
    interaction.setSelection(props.view, times)
  } else if (selectionAnchor.value) {
    selectionAnchor.value = undefined
    interaction.clearSelection()
  }
  focusSlot(next.col, next.slot)
}

// --- scroll to the configured time ------------------------------------------------------------

function scrollToMinute(minute: number) {
  const el = scroller.value
  if (!el || !body.value || !head.value) return
  const { dayStartMinute, dayEndMinute } = config.value
  const fraction = (minute - dayStartMinute) / (dayEndMinute - dayStartMinute)
  el.scrollTop = Math.max(
    0,
    body.value.offsetTop + fraction * body.value.offsetHeight - head.value.offsetHeight,
  )
}

onMounted(() => {
  const s = props.settings
  scrollToMinute(parseTimeOfDay(s.scrollTime, ctx.options.value.scrollMinute))
})
watch(
  () => props.settings.scrollTime,
  () =>
    nextTick(() =>
      scrollToMinute(parseTimeOfDay(props.settings.scrollTime, ctx.options.value.scrollMinute)),
    ),
)

defineExpose({ scrollToMinute })
</script>

<template>
  <div
    ref="root"
    class="orb-tg"
    role="group"
    :aria-label="ctx.title.value"
    :style="{ '--orb-tg-days': columns.length, '--orb-tg-slots': slots.length }"
  >
    <div ref="scroller" class="orb-tg__scroller">
      <div ref="head" class="orb-tg__head">
        <div v-for="(row, ri) in headerRows" :key="ri" class="orb-tg__row">
          <div class="orb-tg__corner" />
          <template v-for="cell in row" :key="cell.key">
            <div
              v-if="cell.kind === 'day'"
              class="orb-tg__day-header"
              :class="{
                'is-today': cell.column.isToday,
                'is-past': cell.column.isPast,
                'is-weekend': cell.column.isWeekend,
                'is-group-end': cell.span === 1 && cell.column.isGroupEnd,
              }"
              :style="{ gridColumn: `${cell.col + 2} / span ${cell.span}` }"
            >
              <button
                type="button"
                class="orb-tg__day-button"
                :aria-label="dateLabel(cell.column.date)"
                :aria-current="cell.column.isToday ? 'date' : undefined"
                @click="onDateClick(cell.column, $event)"
              >
                <RenderSlot
                  :fn="resolve('day-header')"
                  :scope="{
                    date: cell.column.date,
                    view,
                    isToday: cell.column.isToday,
                    weekday: cell.column.weekday,
                    dayNumber: cell.column.dayNumber,
                  }"
                >
                  <span class="orb-tg__weekday">{{ cell.column.weekday }}</span>
                  <span class="orb-tg__daynum">{{ cell.column.dayNumber }}</span>
                </RenderSlot>
              </button>
            </div>
            <div
              v-else
              class="orb-tg__resource-header"
              :class="{ 'is-group-end': cell.span === 1 && cell.column.isGroupEnd }"
              :style="{ gridColumn: `${cell.col + 2} / span ${cell.span}` }"
              @click="onResourceClick(cell.column.resource!, $event)"
            >
              <RenderSlot
                :fn="resolve('resource-label')"
                :scope="resourceScope(cell.column.resource!)"
              >
                <span class="orb-tg__resource-title">{{ cell.column.resource!.title }}</span>
              </RenderSlot>
            </div>
          </template>
        </div>

        <div v-if="config.allDaySlot" class="orb-tg__row orb-tg__row--allday">
          <div class="orb-tg__allday-label">
            <RenderSlot :fn="resolve('all-day-label')" :scope="{ label: messages.allDay }">
              {{ messages.allDay }}
            </RenderSlot>
          </div>
          <div
            ref="allDayEl"
            class="orb-tg__allday"
            :style="{ '--orb-allday-rows': Math.max(allDay.rowCount, 1) }"
            @pointerdown="onEmptyPointerDown"
          >
            <div
              v-for="(col, i) in columns"
              :key="i"
              class="orb-tg__allday-cell"
              :class="{
                'is-today': col.isToday,
                'is-weekend': col.isWeekend,
                'is-group-end': col.isGroupEnd,
              }"
              :style="{ gridColumn: i + 1 }"
              @click="onAllDay('slot-click', col, $event)"
              @dblclick="onAllDay('slot-dblclick', col, $event)"
              @contextmenu="onAllDay('slot-contextmenu', col, $event)"
            />
            <div
              v-for="range in allDaySelection"
              :key="range.startCol"
              class="orb-tg__allday-selection"
              :style="{ gridColumn: `${range.startCol + 1} / ${range.endCol + 1}` }"
              aria-hidden="true"
            />
            <EventItem
              v-for="item in allDay.items"
              :key="item.key"
              :occurrence="item.occurrence"
              variant="all-day"
              :view="view"
              :resolve="resolve"
              :is-start="item.isStart"
              :is-end="item.isEnd"
              :mirror="item.mirror"
              :valid="interaction.mirror.value?.valid ?? true"
              :resource-id="columns[item.startCol]?.resourceId"
              :snap-minutes="snapMinutes()"
              :style="allDayStyle(item)"
            />
          </div>
        </div>
      </div>

      <div ref="body" class="orb-tg__body">
        <div class="orb-tg__gutter" aria-hidden="true">
          <div
            v-for="slot in slots"
            :key="slot.startMinute"
            class="orb-tg__time-label"
            :class="{ 'is-labelled': slot.isLabelled }"
          >
            <RenderSlot
              v-if="slot.isLabelled"
              :fn="resolve('time-label')"
              :scope="{ minute: slot.startMinute, label: slot.label }"
            >
              <span>{{ slot.label }}</span>
            </RenderSlot>
          </div>
        </div>

        <div
          v-for="(col, ci) in columns"
          :key="ci /* by position: navigating reuses the slot cells */"
          :ref="(el) => setColumnEl(el, ci)"
          class="orb-tg__column"
          :class="{
            'is-today': col.isToday,
            'is-past': col.isPast,
            'is-weekend': col.isWeekend,
            'is-group-end': col.isGroupEnd,
          }"
          role="group"
          :aria-label="columnLabel(col)"
          @pointerdown="onEmptyPointerDown"
        >
          <div
            v-for="(slot, si) in slots"
            :key="slot.startMinute"
            class="orb-tg__slot"
            :class="{ 'is-labelled': slot.isLabelled }"
            role="button"
            :aria-label="slot.label || undefined"
            :tabindex="activeCell.col === ci && activeCell.slot === si ? 0 : -1"
            :data-cell="`${ci}-${si}`"
            @click="onSlot('slot-click', col, slot, $event)"
            @dblclick="onSlot('slot-dblclick', col, slot, $event)"
            @contextmenu="onSlot('slot-contextmenu', col, slot, $event)"
            @keydown="onSlotKeydown($event, ci, si)"
            @focus="focusCell = { col: ci, slot: si }"
          >
            <RenderSlot
              v-if="timeSlotSlot"
              :fn="timeSlotSlot"
              :scope="{
                view,
                date: col.date,
                isToday: col.isToday,
                resourceId: col.resourceId,
                ...slotRange(col.date, slot.startMinute, slot.endMinute),
              }"
            />
          </div>

          <div class="orb-tg__events">
            <EventItem
              v-for="item in timed[ci]"
              :key="item.key"
              :occurrence="item.segment.occurrence"
              variant="time"
              :view="view"
              :resolve="resolve"
              :is-start="item.segment.isStart"
              :is-end="item.segment.isEnd"
              :resource-id="col.resourceId"
              :snap-minutes="snapMinutes()"
              :style="eventStyle(item)"
            />
            <template v-for="overlay in overlays[ci]" :key="overlay.key">
              <div
                v-if="overlay.kind === 'selection'"
                class="orb-tg__selection"
                :style="{ top: pct(overlay.top), height: pct(overlay.height) }"
                aria-hidden="true"
              />
              <EventItem
                v-else
                class="orb-tg__mirror"
                :occurrence="overlay.segment.occurrence"
                variant="time"
                :view="view"
                :resolve="resolve"
                :is-start="overlay.segment.isStart"
                :is-end="overlay.segment.isEnd"
                mirror
                :valid="overlay.valid"
                :style="{ top: pct(overlay.top), height: pct(overlay.height) }"
              />
            </template>
          </div>

          <div
            v-if="ctx.options.value.nowIndicator && nowLine && nowLine.columnIndexes.includes(ci)"
            class="orb-tg__now"
            :style="{ top: pct(nowLine.top) }"
            aria-hidden="true"
          >
            <RenderSlot :fn="resolve('now-indicator')" :scope="{ now: nowLine.now, label: '' }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
