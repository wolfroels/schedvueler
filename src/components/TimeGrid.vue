<script setup lang="ts">
import {
  computed,
  mergeProps,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  Temporal,
  computeSelection,
  formatDate,
  formatTime,
  formatTimeOfDay,
  zonedAtMinute,
  leafResources,
  timeGridLayouts,
  type Hit,
  type ResourceNode,
} from '../core'
import { parseTimeOfDay, useSchedulerContext } from '../composables/context'
import type { SlotResolver } from '../composables/useSchedulerView'
import { validMinutes, visibleHours } from '../composables/validate'
import {
  useTimeGrid,
  type TimeGridColumn,
  type TimeGridSlotRow,
  type AllDayEventLayout,
  type TimedEventLayout,
} from '../composables/useTimeGrid'
import EventItem from './EventItem.vue'
import { stableStyle } from './stable-style'
import { visualArrow } from './direction'
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
  const [dayStartMinute, dayEndMinute] = visibleHours(
    parseTimeOfDay(s.dayStartTime, o.dayStartMinute),
    parseTimeOfDay(s.dayEndTime, o.dayEndMinute),
  )
  return {
    days: props.days,
    slotDuration: validMinutes(s.slotDuration, o.slotDuration, 'slotDuration'),
    slotLabelInterval: validMinutes(s.slotLabelInterval, o.slotLabelInterval, 'slotLabelInterval'),
    dayStartMinute,
    dayEndMinute,
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

const {
  columns,
  slots,
  allDay,
  timed,
  overlays,
  allDaySelection,
  nowLine,
  slotRange,
  dayRange,
  hiddenEvents,
} = useTimeGrid(ctx, config)

const availability = ctx.availability

const extraZones = computed(() => ctx.options.value.raw.extraTimeZones ?? [])

/** A short name per extra zone, for the corner above the times. */
const zoneNames = computed(() =>
  extraZones.value.map((zone) => {
    const parts = new Intl.DateTimeFormat(ctx.options.value.locale, {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone
  }),
)

/** The time in each extra zone at a minute of the first visible day. */
function zoneLabels(minute: number) {
  const first = props.days[0]
  if (!extraZones.value.length || !first) return []
  const { timeZone, locale, hour12 } = ctx.options.value
  const moment = zonedAtMinute(first, minute, timeZone)
  return extraZones.value.map((zone) => ({
    zone,
    text: formatTime(moment.withTimeZone(zone), locale, { hour12, compact: true }),
  }))
}

/** Fractions of the column for a stretch of minutes. */
function shadeStyle(shade: { start: number; end: number; color?: string }) {
  const { dayStartMinute, dayEndMinute } = config.value
  const total = dayEndMinute - dayStartMinute
  return {
    top: pct((shade.start - dayStartMinute) / total),
    height: pct((shade.end - shade.start) / total),
    ...(shade.color ? { '--orb-background-event-color': shade.color } : {}),
  }
}

const SHADE_PART = {
  closed: 'closedTime',
  blocked: 'blockedTime',
  background: 'backgroundEvent',
} as const
const SHADE_SLOT = {
  closed: 'closed-time',
  blocked: 'blocked-time',
  background: 'background-event',
} as const

function isOutOfRange(date: Temporal.PlainDate) {
  const { min, max } = ctx.dateLimits.value
  return (
    (!!min && Temporal.PlainDate.compare(date, min) < 0) ||
    (!!max && Temporal.PlainDate.compare(date, max) > 0)
  )
}

function cellInfo(col: TimeGridColumn, slot: TimeGridSlotRow) {
  return {
    view: props.view,
    date: col.date,
    ...slotRange(col.date, slot.startMinute, slot.endMinute),
    allDay: false,
    resourceId: col.resourceId,
  }
}

function slotAttrs(col: TimeGridColumn, slot: TimeGridSlotRow) {
  const o = ctx.options.value.raw
  if (!o.slotAttrs && !o.isSlotDisabled)
    return ctx.part('timeSlot', { column: col, minute: slot.startMinute })
  const info = cellInfo(col, slot)
  return mergeProps(
    ctx.part('timeSlot', { column: col, minute: slot.startMinute }),
    (o.slotAttrs?.(info) ?? {}) as Record<string, unknown>,
    o.isSlotDisabled?.(info) ? { class: 'is-disabled' } : {},
  )
}

const selectionScope = computed(() => {
  const sel = interaction.selection.value
  return sel
    ? { view: props.view, ...sel.times, resourceId: sel.times.resourceIds?.[0] }
    : undefined
})

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
    insetInlineStart: pct(i.left),
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

/** What a slot is read out as: where it is, and when. */
function slotLabel(col: TimeGridColumn, slot: TimeGridSlotRow) {
  const { locale, hour12 } = ctx.options.value
  return `${columnLabel(col)}, ${formatTimeOfDay(slot.startMinute, locale, { hour12 })}`
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
  if (
    name === 'slot-click' &&
    interaction.placeArmed(
      {
        zone: 'time',
        date: col.date,
        minute: slot.startMinute,
        resourceId: col.resourceId,
      },
      e,
    )
  )
    return
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
  if (
    name === 'slot-click' &&
    interaction.placeArmed({ zone: 'all-day', date: col.date, resourceId: col.resourceId }, e)
  )
    return
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
  // First and last column swap sides right to left.
  const left = Math.min(rects[0]!.left, rects[rects.length - 1]!.left)
  const right = Math.max(rects[0]!.right, rects[rects.length - 1]!.right)
  if (x < left || x > right) return null
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
    scrollArea: () => {
      const rect = scroller.value?.getBoundingClientRect()
      const headRect = head.value?.getBoundingClientRect()
      return rect && headRect && { ...rect.toJSON(), top: headRect.bottom }
    },
    snapMinutes,
    scrollToMinute,
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

function onSlotFocus(col: number, slot: number) {
  focusCell.value = { col, slot }
  interaction.setCursor(slotHit(col, slot))
}

function focusSlot(col: number, slot: number) {
  focusCell.value = { col, slot }
  nextTick(() => root.value?.querySelector<HTMLElement>(`[data-cell="${col}-${slot}"]`)?.focus())
}

function onSlotKeydown(e: KeyboardEvent, col: number, slot: number) {
  const key = e.key.toLowerCase()
  if (key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && interaction.selectable) {
    const hit = slotHit(col, slot)
    const times = computeSelection(hit, hit, {
      timeZone: ctx.options.value.timeZone,
      snapMinutes: snapMinutes(),
      defaultDurationMinutes: 60,
    })
    if (times) interaction.setSelection(props.view, times, e)
    return
  }
  if ((key === 'enter' || key === ' ') && interaction.dropArmed(slotHit(col, slot), e)) {
    e.preventDefault()
    return
  }
  const lastCol = columns.value.length - 1
  const lastSlot = slots.value.length - 1
  let next = { col, slot }
  switch (visualArrow(e.key, e.currentTarget as HTMLElement)) {
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
    v-bind="ctx.part('timeGrid')"
    role="grid"
    :aria-label="ctx.title.value"
    :style="{
      '--orb-tg-days': columns.length,
      '--orb-tg-slots': slots.length,
      '--orb-tg-zones': extraZones.length,
    }"
  >
    <div ref="scroller" class="orb-tg__scroller">
      <div ref="head" class="orb-tg__head" v-bind="ctx.part('gridHead')">
        <div v-for="(row, ri) in headerRows" :key="ri" class="orb-tg__row" role="row">
          <div class="orb-tg__corner" role="columnheader">
            <span
              v-if="ri === 0 && ctx.options.value.raw.weekNumbers && days[0]"
              class="orb-week-number"
              v-bind="ctx.part('weekNumber', { date: days[0] })"
            >
              <RenderSlot
                :fn="resolve('week-number')"
                :scope="{ view, week: days[0].weekOfYear ?? 0, date: days[0] }"
              >
                {{ days[0].weekOfYear }}
              </RenderSlot>
            </span>
            <span v-for="zone in zoneNames" v-show="ri === 0" :key="zone" class="orb-tg__zone-name">
              {{ zone }}
            </span>
          </div>
          <template v-for="cell in row" :key="cell.key">
            <div
              v-if="cell.kind === 'day'"
              class="orb-tg__day-header"
              role="columnheader"
              v-bind="ctx.part('dayHeader', { column: cell.column })"
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
                :aria-label="`${cell.column.weekday} ${cell.column.dayNumber}, ${dateLabel(cell.column.date)}`"
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
                  {{ ' ' }}
                  <span class="orb-tg__daynum">{{ cell.column.dayNumber }}</span>
                </RenderSlot>
              </button>
            </div>
            <div
              v-else
              class="orb-tg__resource-header"
              role="columnheader"
              v-bind="ctx.part('resourceHeader', { column: cell.column })"
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

        <div v-if="config.allDaySlot" class="orb-tg__row orb-tg__row--allday" role="row">
          <div class="orb-tg__allday-label" v-bind="ctx.part('allDayLabel')" role="rowheader">
            <RenderSlot :fn="resolve('all-day-label')" :scope="{ label: messages.allDay }">
              {{ messages.allDay }}
            </RenderSlot>
          </div>
          <div
            ref="allDayEl"
            class="orb-tg__allday"
            v-bind="ctx.part('allDayRow')"
            role="gridcell"
            :style="{ '--orb-allday-rows': Math.max(allDay.rowCount, 1) }"
            @pointerdown="onEmptyPointerDown"
          >
            <div
              v-for="(col, i) in columns"
              :key="i"
              class="orb-tg__allday-cell"
              v-bind="ctx.part('allDayCell', { column: col })"
              :aria-hidden="true"
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
              v-bind="ctx.part('selection')"
              :style="{ gridColumn: `${range.startCol + 1} / ${range.endCol + 1}` }"
              aria-hidden="true"
            >
              <RenderSlot :fn="resolve('selection')" :scope="selectionScope" />
            </div>
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
        <div class="orb-tg__gutter" v-bind="ctx.part('gutter')" aria-hidden="true">
          <div
            v-for="slot in slots"
            :key="slot.startMinute"
            class="orb-tg__time-label"
            v-bind="ctx.part('timeLabel', { minute: slot.startMinute })"
            :class="{ 'is-labelled': slot.isLabelled }"
          >
            <RenderSlot
              v-if="slot.isLabelled"
              :fn="resolve('time-label')"
              :scope="{ minute: slot.startMinute, label: slot.label }"
            >
              <span>{{ slot.label }}</span>
              <span
                v-for="(label, zi) in zoneLabels(slot.startMinute)"
                :key="label.zone"
                class="orb-tg__zone-label"
                :style="{ '--orb-zone-index': zi }"
                v-bind="ctx.part('zoneLabel', { zone: label.zone, minute: slot.startMinute })"
              >
                {{ label.text }}
              </span>
            </RenderSlot>
          </div>
        </div>

        <div
          v-for="(col, ci) in columns"
          :key="ci /* by position: navigating reuses the slot cells */"
          :ref="(el) => setColumnEl(el, ci)"
          class="orb-tg__column"
          v-bind="ctx.part('column', { column: col })"
          :class="{
            'is-today': col.isToday,
            'is-past': col.isPast,
            'is-weekend': col.isWeekend,
            'is-group-end': col.isGroupEnd,
            'is-out-of-range': isOutOfRange(col.date),
          }"
          role="row"
          :aria-label="columnLabel(col)"
          @pointerdown="onEmptyPointerDown"
        >
          <div
            v-for="(slot, si) in slots"
            :key="slot.startMinute"
            class="orb-tg__slot"
            v-bind="slotAttrs(col, slot)"
            :class="{ 'is-labelled': slot.isLabelled }"
            role="gridcell"
            :aria-label="slotLabel(col, slot)"
            :tabindex="activeCell.col === ci && activeCell.slot === si ? 0 : -1"
            :data-cell="`${ci}-${si}`"
            @click="onSlot('slot-click', col, slot, $event)"
            @dblclick="onSlot('slot-dblclick', col, slot, $event)"
            @contextmenu="onSlot('slot-contextmenu', col, slot, $event)"
            @keydown="onSlotKeydown($event, ci, si)"
            @focus="onSlotFocus(ci, si)"
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

          <div v-if="availability.hasShades.value" class="orb-tg__shades" aria-hidden="true">
            <div
              v-for="shade in availability.shadesFor(
                col.date,
                col.resourceId,
                config.dayStartMinute,
                config.dayEndMinute,
              )"
              :key="shade.key"
              class="orb-shade"
              :class="`orb-shade--${shade.kind}`"
              v-bind="ctx.part(SHADE_PART[shade.kind], { shade, column: col })"
              :style="shadeStyle(shade)"
            >
              <RenderSlot
                :fn="resolve(SHADE_SLOT[shade.kind])"
                :scope="{
                  view,
                  date: col.date,
                  resourceId: col.resourceId,
                  title: shade.title,
                  color: shade.color,
                  occurrence: shade.occurrence,
                }"
              >
                <span v-if="shade.title" class="orb-shade__title">{{ shade.title }}</span>
              </RenderSlot>
            </div>
          </div>

          <div class="orb-tg__events" role="gridcell">
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
                v-bind="ctx.part('selection')"
                :style="{ top: pct(overlay.top), height: pct(overlay.height) }"
                aria-hidden="true"
              >
                <RenderSlot :fn="resolve('selection')" :scope="selectionScope" />
              </div>
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

          <template v-for="direction in ['before', 'after'] as const" :key="direction">
            <div
              v-if="hiddenEvents[ci]?.[direction].length"
              class="orb-tg__hidden"
              :class="`orb-tg__hidden--${direction}`"
              role="gridcell"
              v-bind="ctx.part('hiddenIndicator', { column: col, direction })"
            >
              <RenderSlot
                :fn="resolve('hidden-events')"
                :scope="{
                  view,
                  date: col.date,
                  direction,
                  count: hiddenEvents[ci]![direction].length,
                  occurrences: hiddenEvents[ci]![direction],
                  label: messages.hiddenEvents(hiddenEvents[ci]![direction].length, direction),
                }"
              >
                {{ messages.hiddenEvents(hiddenEvents[ci]![direction].length, direction) }}
              </RenderSlot>
            </div>
          </template>

          <div
            v-if="ctx.options.value.nowIndicator && nowLine && nowLine.columnIndexes.includes(ci)"
            class="orb-tg__now"
            v-bind="ctx.part('nowIndicator')"
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
