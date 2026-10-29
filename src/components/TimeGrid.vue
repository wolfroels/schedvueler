<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { timeGridLayouts, type Temporal } from '../core'
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

const { columns, slots, allDay, timed, nowLine, slotRange, dayRange } = useTimeGrid(ctx, config)

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

// Scroll the configured time into view when the grid opens.
const scroller = ref<HTMLElement>()
const head = ref<HTMLElement>()
const body = ref<HTMLElement>()

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
    class="orb-tg"
    role="grid"
    :aria-label="ctx.title.value"
    :style="{ '--orb-tg-days': columns.length, '--orb-tg-slots': slots.length }"
  >
    <div ref="scroller" class="orb-tg__scroller">
      <div ref="head" class="orb-tg__head">
        <div class="orb-tg__row" role="row">
          <div class="orb-tg__corner" />
          <div
            v-for="col in columns"
            :key="col.key"
            class="orb-tg__day-header"
            :class="{ 'is-today': col.isToday, 'is-past': col.isPast, 'is-weekend': col.isWeekend }"
            role="columnheader"
            :aria-current="col.isToday ? 'date' : undefined"
          >
            <button type="button" class="orb-tg__day-button" @click="onDateClick(col, $event)">
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

        <div v-if="config.allDaySlot" class="orb-tg__row orb-tg__row--allday" role="row">
          <div class="orb-tg__allday-label">
            <RenderSlot :fn="resolve('all-day-label')" :scope="{ label: messages.allDay }">
              {{ messages.allDay }}
            </RenderSlot>
          </div>
          <div
            class="orb-tg__allday"
            :style="{ '--orb-allday-rows': Math.max(allDay.rowCount, 1) }"
          >
            <div
              v-for="(col, i) in columns"
              :key="col.key"
              class="orb-tg__allday-cell"
              :class="{ 'is-today': col.isToday, 'is-weekend': col.isWeekend }"
              :style="{ gridColumn: i + 1 }"
              role="gridcell"
              @click="onAllDay('slot-click', col, $event)"
              @dblclick="onAllDay('slot-dblclick', col, $event)"
              @contextmenu="onAllDay('slot-contextmenu', col, $event)"
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
          class="orb-tg__column"
          :class="{ 'is-today': col.isToday, 'is-past': col.isPast, 'is-weekend': col.isWeekend }"
        >
          <div
            v-for="slot in slots"
            :key="slot.startMinute"
            class="orb-tg__slot"
            :class="{ 'is-labelled': slot.isLabelled }"
            role="gridcell"
            @click="onSlot('slot-click', col, slot, $event)"
            @dblclick="onSlot('slot-dblclick', col, slot, $event)"
            @contextmenu="onSlot('slot-contextmenu', col, slot, $event)"
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
