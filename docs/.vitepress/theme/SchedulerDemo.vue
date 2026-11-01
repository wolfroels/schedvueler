<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useData } from 'vitepress'
import {
  AgendaView,
  DayView,
  GanttView,
  MonthView,
  MultiMonthView,
  Scheduler,
  Temporal,
  TimelineView,
  WeekView,
  YearView,
  applyEventEdits,
  removeEventOccurrences,
  useHistory,
  type EventChangedPayload,
  type EventDeletePayload,
  type SchedulerEvent,
  type SelectPayload,
} from '@orb/index'

/** A live scheduler for the docs. Drag, resize and select work on its own copy of the events. */
const props = withDefaults(
  defineProps<{
    view?: string
    height?: number
    options?: Record<string, unknown>
    viewProps?: Record<string, unknown>
  }>(),
  { view: 'week', height: 560 },
)

const { isDark } = useData()
const timeZone = Temporal.Now.timeZoneId()
const today = Temporal.Now.plainDateISO()
const monday = today.subtract({ days: today.dayOfWeek - 1 })
const at = (day: number, hour: number, minute = 0) =>
  monday.add({ days: day }).toPlainDateTime({ hour, minute }).toString()

const resources = [
  { id: 'crew-a', title: 'Crew A', color: '#2563eb', seats: 4 },
  { id: 'crew-b', title: 'Crew B', color: '#0891b2', seats: 6 },
  { id: 'crane', title: 'Crane', color: '#ea580c', seats: 1 },
]

const events = shallowRef<SchedulerEvent[]>([
  { id: 1, title: 'Site visit', start: at(0, 9), end: at(0, 10, 30), resourceId: 'crew-a', progress: 1 },
  { id: 2, title: 'Foundation', start: at(1, 8), end: at(1, 16), resourceId: 'crew-b', progress: 0.4, dependsOn: [1] },
  { id: 3, title: 'Lift', start: at(2, 10), end: at(2, 12), resourceId: 'crane', dependsOn: [2] },
  { id: 4, title: 'Team standup', start: at(0, 8, 30), end: at(0, 9), rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', resourceId: 'crew-a' },
  { id: 5, title: 'Inspection', start: at(3, 13), end: at(3, 14, 30), resourceId: 'crew-b', color: '#db2777' },
  { id: 6, title: 'Holiday', start: monday.add({ days: 4 }).toString(), resourceId: 'crew-a', color: '#16a34a' },
  { id: 7, title: 'Delivery', start: at(2, 15), end: at(2, 16), resourceId: 'crew-a' },
])
const history = useHistory(events, { keyboard: true })

function onChange(p: EventChangedPayload<SchedulerEvent>) {
  history.commit(applyEventEdits(events.value, [p, ...p.others], { scope: p.scope, timeZone }))
}

function onDelete(p: EventDeletePayload<SchedulerEvent>) {
  history.commit(
    removeEventOccurrences(events.value, [p.occurrence, ...p.others], { scope: p.scope, timeZone }),
  )
}

let nextId = 100
function onSelect(p: SelectPayload) {
  history.commit([
    ...events.value,
    {
      id: nextId++,
      title: 'New event',
      start: p.allDay ? p.start.toPlainDate().toString() : p.start.toString(),
      end: p.allDay ? p.end.toPlainDate().toString() : p.end.toString(),
      resourceId: p.resourceId,
    },
  ])
}

const views = { day: DayView, week: WeekView, month: MonthView, year: YearView, agenda: AgendaView, timeline: TimelineView, gantt: GanttView, 'multi-month': MultiMonthView } as const
const viewComponent = computed(() => views[props.view as keyof typeof views] ?? WeekView)
</script>

<template>
  <ClientOnly>
    <div class="scheduler-demo" :style="{ height: `${height}px` }">
      <Scheduler
        :events="events"
        :resources="resources"
        :theme="isDark ? 'dark' : 'light'"
        :time-zone="timeZone"
        editable
        selectable
        :toolbar="true"
        v-bind="options"
        @event-drop="onChange"
        @event-resize="onChange"
        @event-delete="onDelete"
        @select="onSelect"
      >
        <component :is="viewComponent" v-bind="viewProps" />
      </Scheduler>
    </div>
  </ClientOnly>
</template>

<style>
.scheduler-demo {
  margin: 1rem 0;
}

/* The docs theme styles tables, buttons and lists; the scheduler brings its own. */
.scheduler-demo button {
  font: inherit;
}

.vp-doc .scheduler-demo h2,
.vp-doc .scheduler-demo h3 {
  margin: 0;
  padding: 0;
  border: 0;
  letter-spacing: normal;
}

.vp-doc .scheduler-demo ul {
  margin: 0;
  padding: 0;
}
</style>
