<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { computeSelection, formatDate, timeGridLayouts, type Hit, type Temporal } from '../core'
import { parseTimeOfDay, useSchedulerContext } from '../composables/context'
import type { SlotResolver } from '../composables/useSchedulerView'
import {
  useTimeGrid,
  type TimeGridColumn,
  type TimeGridSlotRow,
  type TimedEventLayout,
} from '../composables/useTimeGrid'
import EventItem from './EventItem.vue'
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
  }
})

const { columns, slots, allDay, timed, overlays, allDaySelection, nowLine, slotRange, dayRange } =
  useTimeGrid(ctx, config)

const timeSlotSlot = computed(() => props.resolve('time-slot'))
const messages = computed(() => ctx.options.value.messages)
const pct = (fraction: number) => `${fraction * 100}%`

function eventStyle(item: TimedEventLayout<unknown>) {
  return {
    top: pct(item.top),
    height: pct(item.height),
    left: pct(item.left),
    width: `calc(${pct(item.width)} - var(--orb-event-gap))`,
    zIndex: item.order + 1,
  }
}

function columnLabel(col: TimeGridColumn) {
  return formatDate(col.date, ctx.options.value.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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
    nativeEvent: e,
    element: e.currentTarget as HTMLElement,
  })
}

function onDateClick(col: TimeGridColumn, e: MouseEvent) {
  ctx.emit('date-click', {
    view: props.view,
    date: col.date,
    nativeEvent: e,
    element: e.currentTarget as HTMLElement,
  })
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
  const date = columns.value[index]!.date

  const allDayRect = allDayEl.value?.getBoundingClientRect()
  if (allDayRect && y >= allDayRect.top && y < allDayRect.bottom) return { zone: 'all-day', date }

  const rect = rects[index]!
  const { dayStartMinute, dayEndMinute } = config.value
  const fraction = Math.min(Math.max((y - rect.top) / rect.height, 0), 0.9999)
  return { zone: 'time', date, minute: dayStartMinute + fraction * (dayEndMinute - dayStartMinute) }
}

let unregister: (() => void) | undefined
onMounted(() => {
  unregister = interaction.registerSurface({ hitTest, scrollElement: () => scroller.value })
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
      snapMinutes: config.value.slotDuration,
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
        <div class="orb-tg__row">
          <div class="orb-tg__corner" />
          <div
            v-for="col in columns"
            :key="col.key"
            class="orb-tg__day-header"
            :class="{ 'is-today': col.isToday, 'is-past': col.isPast, 'is-weekend': col.isWeekend }"
          >
            <button
              type="button"
              class="orb-tg__day-button"
              :aria-label="columnLabel(col)"
              :aria-current="col.isToday ? 'date' : undefined"
              @click="onDateClick(col, $event)"
            >
              <RenderSlot
                :fn="resolve('day-header')"
                :scope="{
                  date: col.date,
                  view,
                  isToday: col.isToday,
                  weekday: col.weekday,
                  dayNumber: col.dayNumber,
                }"
              >
                <span class="orb-tg__weekday">{{ col.weekday }}</span>
                <span class="orb-tg__daynum">{{ col.dayNumber }}</span>
              </RenderSlot>
            </button>
          </div>
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
              :key="col.key"
              class="orb-tg__allday-cell"
              :class="{ 'is-today': col.isToday, 'is-weekend': col.isWeekend }"
              :style="{ gridColumn: i + 1 }"
              @click="onAllDay('slot-click', col, $event)"
              @dblclick="onAllDay('slot-dblclick', col, $event)"
              @contextmenu="onAllDay('slot-contextmenu', col, $event)"
            />
            <div
              v-if="allDaySelection"
              class="orb-tg__allday-selection"
              :style="{
                gridColumn: `${allDaySelection.startCol + 1} / ${allDaySelection.endCol + 1}`,
              }"
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
              :style="{
                gridColumn: `${item.startCol + 1} / ${item.endCol + 1}`,
                gridRow: item.row + 1,
              }"
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
          :key="col.key"
          :ref="(el) => setColumnEl(el, ci)"
          class="orb-tg__column"
          :class="{ 'is-today': col.isToday, 'is-past': col.isPast, 'is-weekend': col.isWeekend }"
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
            v-if="ctx.options.value.nowIndicator && nowLine && nowLine.columnIndex === ci"
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
