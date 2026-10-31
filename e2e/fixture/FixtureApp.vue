<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import {
  AgendaView,
  DayView,
  MonthView,
  Scheduler,
  TimelineView,
  WeekView,
  YearView,
  applyEventEdit,
  removeEventOccurrence,
  vOrbDraggable,
  type EventChangedPayload,
  type EventDeletePayload,
  type EventReceivePayload,
  type SchedulerEvent,
  type SchedulerPt,
  type SelectPayload,
} from '../../src'

// The test page: fixed data, options from the URL, and every emit written to `window.orbLog`.
const params = new URLSearchParams(location.search)

const view = ref(params.get('view') ?? 'week')
const date = ref(params.get('date') ?? '2026-06-15')
const hiddenDays = (params.get('hidden') ?? '').split(',').filter(Boolean).map(Number)
const blockWeekends = params.has('blockWeekends')
const showSlot = ref(false)

if (params.has('rtl')) document.documentElement.dir = 'rtl'

const log: string[] = []
Object.assign(window, { orbLog: log })

const resources = [
  { id: 'r1', title: 'Room one' },
  { id: 'r2', title: 'Room two' },
]

const busy: SchedulerEvent[] = Array.from({ length: 8 }, (_, i) => ({
  id: `busy-${i}`,
  title: `Busy ${i}`,
  start: `2026-06-11T1${i}:00:00`,
  end: `2026-06-11T1${i}:30:00`,
}))

const events = shallowRef<SchedulerEvent[]>([
  {
    id: 'alpha',
    title: 'Alpha',
    start: '2026-06-15T09:00:00',
    end: '2026-06-15T10:00:00',
    resourceId: 'r1',
  },
  { id: 'beta', title: 'Beta', start: '2026-06-17T09:00:00', end: '2026-06-17T10:00:00' },
  { id: 'holiday', title: 'Holiday', start: '2026-06-16', resourceId: 'r2' },
  {
    id: 'standup',
    title: 'Standup',
    start: '2026-06-18T13:00:00',
    end: '2026-06-18T13:30:00',
    rrule: 'FREQ=DAILY;COUNT=3',
  },
  ...busy,
])

const pt: SchedulerPt = {
  todayButton: { class: 'fixture-today' },
  dayHeader: ({ column }) => ({ 'data-fixture-date': String(column.date) }),
}

type Times = Pick<EventChangedPayload<SchedulerEvent>, 'start' | 'end' | 'allDay'>
const when = (p: Times) =>
  p.allDay
    ? `${p.start.toPlainDate()} ${p.end.toPlainDate()} all-day`
    : `${p.start.toPlainDateTime()} ${p.end.toPlainDateTime()}`

function onChanged(name: string, p: EventChangedPayload<SchedulerEvent>) {
  events.value = applyEventEdit(events.value, p.occurrence, p, {
    scope: p.scope,
    timeZone: 'Europe/Brussels',
  })
  log.push(`${name} ${p.event.title} ${when(p)} @${p.resourceIds.join()}`)
}

function onDelete(p: EventDeletePayload<SchedulerEvent>) {
  events.value = removeEventOccurrence(events.value, p.occurrence, {
    scope: p.scope,
    timeZone: 'Europe/Brussels',
  })
  log.push(`event-delete ${p.event.title}`)
}

const onSelect = (p: SelectPayload) => log.push(`select ${when(p)} @${p.resourceId ?? ''}`)
const onReceive = (p: EventReceivePayload) =>
  log.push(`event-receive ${p.template.title} ${when(p)}`)
</script>

<template>
  <button type="button" class="fixture-toggle" @click="showSlot = !showSlot">Toggle slot</button>
  <span v-orb-draggable="{ title: 'Dropped', duration: 60 }" class="fixture-template"
    >Template</span
  >
  <div class="fixture-frame">
    <Scheduler
      v-model:date="date"
      v-model:view="view"
      :events="events"
      :resources="resources"
      time-zone="Europe/Brussels"
      locale="en-GB"
      :week-start="1"
      :hidden-days="hiddenDays"
      :now-indicator="false"
      scroll-time="06:00"
      :pt="pt"
      editable
      selectable
      drill-down-view="day"
      :can-drop="(info) => !blockWeekends || info.start.dayOfWeek < 6"
      @event-click="(p) => log.push(`event-click ${p.event.title}`)"
      @event-drag-start="(p) => log.push(`event-drag-start ${p.event.title} ${p.kind}`)"
      @event-drag-cancel="(p) => log.push(`event-drag-cancel ${p.event.title} ${p.reason}`)"
      @event-drop="(p) => onChanged('event-drop', p)"
      @event-resize="(p) => onChanged('event-resize', p)"
      @event-delete="onDelete"
      @event-receive="onReceive"
      @select="onSelect"
      @unselect="log.push('unselect')"
      @navigate="(p) => log.push(`navigate ${p.reason} ${p.to}`)"
      @view-change="(p) => log.push(`view-change ${p.to}`)"
      @date-click="(p) => log.push(`date-click ${p.date}`)"
      @slot-click="(p) => log.push(`slot-click ${p.date}`)"
      @more-click="(p) => log.push(`more-click ${p.date} ${p.hiddenCount}`)"
    >
      <template v-if="showSlot" #time-event="{ title }">
        <b class="fixture-slot">Slot {{ title }}</b>
      </template>
      <DayView />
      <DayView name="three" :days="3" label="3 days" />
      <WeekView />
      <MonthView />
      <YearView />
      <AgendaView />
      <DayView name="rooms" label="Rooms" :resources="['r1', 'r2']" />
      <TimelineView label="Timeline" day-start-time="06:00" day-end-time="20:00" />
    </Scheduler>
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}

.fixture-template {
  display: inline-block;
  margin-inline-start: 16px;
  padding: 4px 8px;
  border: 1px solid #888;
  touch-action: none;
  user-select: none;
}

.fixture-frame {
  height: 780px;
  margin-block-start: 16px;
}
</style>
