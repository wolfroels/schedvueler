<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Component } from 'vue'
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
  type SchedulerEvent,
  type SchedulerResource,
} from '../src'

type ViewId = 'day' | 'week' | 'month' | 'multi-month' | 'year' | 'agenda' | 'timeline' | 'gantt'

interface ViewDemo {
  id: string
  title: string
  feature: string
  props?: Record<string, unknown>
  events: SchedulerEvent[]
  resources?: SchedulerResource[]
  code: string
}

interface ViewExample {
  id: ViewId
  label: string
  component: Component
  demos: ViewDemo[]
}

const today = Temporal.Now.plainDateISO()
const monday = today.subtract({ days: today.dayOfWeek - 1 })
const date = ref(today.toString())
const view = ref<ViewId>('day')
const demoId = ref('hours')
const copied = ref(false)

const rooms: SchedulerResource[] = [
  { id: 'room-a', title: 'Room A', color: '#2563eb' },
  { id: 'room-b', title: 'Room B', color: '#16a34a' },
]
const teams: SchedulerResource[] = [
  { id: 'design', title: 'Design', color: '#2563eb' },
  { id: 'build', title: 'Build', color: '#ea580c' },
]
const projectResources: SchedulerResource[] = [
  { id: 'design', title: 'Design', color: '#2563eb' },
  { id: 'build', title: 'Build', color: '#ea580c' },
  { id: 'test', title: 'Test', color: '#16a34a' },
]

const examples: ViewExample[] = [
  {
    id: 'day',
    label: 'Day',
    component: DayView,
    demos: [
      {
        id: 'hours',
        title: 'Working hours',
        feature: 'Limit the visible day and scroll straight to the first meeting.',
        props: { dayStartTime: '08:00', dayEndTime: '18:00', scrollTime: '09:00' },
        events: [
          {
            id: 'standup',
            title: 'Team stand-up',
            start: today.toPlainDateTime({ hour: 9 }).toString(),
            end: today.toPlainDateTime({ hour: 9, minute: 30 }).toString(),
          },
          {
            id: 'review',
            title: 'Design review',
            start: today.toPlainDateTime({ hour: 13 }).toString(),
            end: today.toPlainDateTime({ hour: 14 }).toString(),
          },
          {
            id: 'handoff',
            title: 'Project handoff',
            start: today.toPlainDateTime({ hour: 16 }).toString(),
            end: today.toPlainDateTime({ hour: 17 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, DayView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Team stand-up', start: '2026-11-03T09:00', end: '2026-11-03T09:30' },
  { id: 2, title: 'Design review', start: '2026-11-03T13:00', end: '2026-11-03T14:00' },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events">
      <DayView day-start-time="08:00" day-end-time="18:00" scroll-time="09:00" />
    </Scheduler>
  </div>
</template>`,
      },
      {
        id: 'three-days',
        title: 'Three-day schedule',
        feature: 'Show several consecutive days without switching to the full week.',
        props: { days: 3, label: 'Three days' },
        events: [
          {
            id: 'planning',
            title: 'Planning',
            start: today.toPlainDateTime({ hour: 10 }).toString(),
            end: today.toPlainDateTime({ hour: 11 }).toString(),
          },
          {
            id: 'workshop',
            title: 'Workshop',
            start: today.add({ days: 1 }).toPlainDateTime({ hour: 13 }).toString(),
            end: today.add({ days: 1 }).toPlainDateTime({ hour: 15 }).toString(),
          },
          {
            id: 'demo',
            title: 'Team demo',
            start: today.add({ days: 2 }).toPlainDateTime({ hour: 15 }).toString(),
            end: today.add({ days: 2 }).toPlainDateTime({ hour: 16 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, DayView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Planning', start: '2026-11-03T10:00', end: '2026-11-03T11:00' },
  { id: 2, title: 'Workshop', start: '2026-11-04T13:00', end: '2026-11-04T15:00' },
  { id: 3, title: 'Team demo', start: '2026-11-05T15:00', end: '2026-11-05T16:00' },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events">
      <DayView :days="3" label="Three days" />
    </Scheduler>
  </div>
</template>`,
      },
    ],
  },
  {
    id: 'week',
    label: 'Week',
    component: WeekView,
    demos: [
      {
        id: 'work-week',
        title: 'Work week',
        feature: 'Show five work days while keeping the week view controls.',
        props: { days: 5, label: 'Work week' },
        events: [
          {
            id: 'standup',
            title: 'Team stand-up',
            start: monday.add({ days: 1 }).toPlainDateTime({ hour: 9 }).toString(),
            end: monday.add({ days: 1 }).toPlainDateTime({ hour: 9, minute: 30 }).toString(),
          },
          {
            id: 'review',
            title: 'Design review',
            start: monday.add({ days: 2 }).toPlainDateTime({ hour: 10 }).toString(),
            end: monday.add({ days: 2 }).toPlainDateTime({ hour: 11 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, WeekView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Team stand-up', start: '2026-11-03T09:00', end: '2026-11-03T09:30' },
  { id: 2, title: 'Design review', start: '2026-11-04T10:00', end: '2026-11-04T11:00' },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events">
      <WeekView :days="5" label="Work week" />
    </Scheduler>
  </div>
</template>`,
      },
      {
        id: 'resources',
        title: 'Compare teams by day',
        feature: 'Group resource rows inside each day to compare team assignments.',
        props: { resources: ['design', 'build'], groupBy: 'date', label: 'Teams by day' },
        events: [
          {
            id: 'wireframes',
            title: 'Wireframes',
            start: monday.add({ days: 1 }).toPlainDateTime({ hour: 9 }).toString(),
            end: monday.add({ days: 1 }).toPlainDateTime({ hour: 11 }).toString(),
            resourceId: 'design',
          },
          {
            id: 'prototype',
            title: 'Build prototype',
            start: monday.add({ days: 1 }).toPlainDateTime({ hour: 12 }).toString(),
            end: monday.add({ days: 1 }).toPlainDateTime({ hour: 15 }).toString(),
            resourceId: 'build',
          },
          {
            id: 'review',
            title: 'Review',
            start: monday.add({ days: 2 }).toPlainDateTime({ hour: 10 }).toString(),
            end: monday.add({ days: 2 }).toPlainDateTime({ hour: 11 }).toString(),
            resourceId: 'design',
          },
        ],
        resources: teams,
        code: `<script setup lang="ts">
import { Scheduler, WeekView, type SchedulerEvent, type SchedulerResource } from 'schedvueler'

const resources: SchedulerResource[] = [
  { id: 'design', title: 'Design' },
  { id: 'build', title: 'Build' },
]
const events: SchedulerEvent[] = [
  { id: 1, title: 'Wireframes', start: '2026-11-03T09:00', end: '2026-11-03T11:00', resourceId: 'design' },
  { id: 2, title: 'Build prototype', start: '2026-11-03T12:00', end: '2026-11-03T15:00', resourceId: 'build' },
]
<\/script>

<template>
  <div style="height: 560px">
    <Scheduler :events="events" :resources="resources">
      <WeekView :resources="['design', 'build']" group-by="date" />
    </Scheduler>
  </div>
</template>`,
      },
    ],
  },
  {
    id: 'month',
    label: 'Month',
    component: MonthView,
    demos: [
      {
        id: 'overflow',
        title: 'Overflow summary',
        feature: 'Cap event rows so busy dates collapse into a “more” count.',
        props: { maxEventRows: 2 },
        events: [
          {
            id: 'planning',
            title: 'Planning day',
            start: today.toString(),
            end: today.add({ days: 1 }).toString(),
          },
          {
            id: 'review',
            title: 'Project review',
            start: today.toString(),
            end: today.add({ days: 1 }).toString(),
          },
          {
            id: 'proposal',
            title: 'Send proposal',
            start: today.toString(),
            end: today.add({ days: 1 }).toString(),
          },
          {
            id: 'kickoff',
            title: 'Project kickoff',
            start: today.toString(),
            end: today.add({ days: 1 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, MonthView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Planning day', start: '2026-11-03', end: '2026-11-04' },
  { id: 2, title: 'Project review', start: '2026-11-03', end: '2026-11-04' },
  { id: 3, title: 'Send proposal', start: '2026-11-03', end: '2026-11-04' },
  { id: 4, title: 'Project kickoff', start: '2026-11-03', end: '2026-11-04' },
]
<\/script>

<template>
  <div style="height: 560px">
    <Scheduler :events="events">
      <MonthView :max-event-rows="2" />
    </Scheduler>
  </div>
</template>`,
      },
      {
        id: 'two-weeks',
        title: 'Two-week view',
        feature: 'Focus the month grid on a short planning horizon.',
        props: { weeks: 2, fixedWeeks: true },
        events: [
          {
            id: 'planning',
            title: 'Planning day',
            start: today.toString(),
            end: today.add({ days: 1 }).toString(),
          },
          {
            id: 'deadline',
            title: 'Milestone',
            start: today.add({ days: 7 }).toString(),
            end: today.add({ days: 8 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, MonthView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Planning day', start: '2026-11-03', end: '2026-11-04' },
  { id: 2, title: 'Milestone', start: '2026-11-10', end: '2026-11-11' },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events">
      <MonthView :weeks="2" fixed-weeks />
    </Scheduler>
  </div>
</template>`,
      },
    ],
  },
  {
    id: 'multi-month',
    label: 'Multi-month',
    component: MultiMonthView,
    demos: [
      {
        id: 'quarter',
        title: 'Quarter at a glance',
        feature: 'Render three consecutive month grids for near-term planning.',
        props: { months: 3, label: 'Quarter' },
        events: [
          {
            id: 'start',
            title: 'Project starts',
            start: today.toString(),
            end: today.add({ days: 1 }).toString(),
          },
          {
            id: 'review',
            title: 'Quarterly review',
            start: today.add({ months: 2, days: 3 }).toString(),
            end: today.add({ months: 2, days: 4 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, MultiMonthView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Project starts', start: '2026-11-03', end: '2026-11-04' },
  { id: 2, title: 'Quarterly review', start: '2027-01-06', end: '2027-01-07' },
]
<\/script>

<template>
  <div style="height: 560px">
    <Scheduler :events="events">
      <MultiMonthView :months="3" />
    </Scheduler>
  </div>
</template>`,
      },
      {
        id: 'half-year',
        title: 'Half-year planning',
        feature: 'Expand the range to six months while preserving the same calendar interaction.',
        props: { months: 6, maxEventRows: 2, label: 'Half year' },
        events: [
          {
            id: 'start',
            title: 'Kickoff',
            start: today.toString(),
            end: today.add({ days: 1 }).toString(),
          },
          {
            id: 'phase-two',
            title: 'Phase two',
            start: today.add({ months: 3 }).toString(),
            end: today.add({ months: 3, days: 3 }).toString(),
          },
          {
            id: 'launch',
            title: 'Launch',
            start: today.add({ months: 5 }).toString(),
            end: today.add({ months: 5, days: 1 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, MultiMonthView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Kickoff', start: '2026-11-03', end: '2026-11-04' },
  { id: 2, title: 'Phase two', start: '2027-02-03', end: '2027-02-06' },
  { id: 3, title: 'Launch', start: '2027-04-03', end: '2027-04-04' },
]
<\/script>

<template>
  <div style="height: 680px">
    <Scheduler :events="events">
      <MultiMonthView :months="6" :max-event-rows="2" />
    </Scheduler>
  </div>
</template>`,
      },
    ],
  },
  {
    id: 'year',
    label: 'Year',
    component: YearView,
    demos: [
      {
        id: 'heatmap',
        title: 'Activity heatmap',
        feature: 'Compare event density across the year at a glance.',
        props: { display: 'heatmap' },
        events: [
          {
            id: 'q1-a',
            title: 'Planning',
            start: today.with({ month: 2, day: 10 }).toString(),
            end: today.with({ month: 2, day: 11 }).toString(),
          },
          {
            id: 'q1-b',
            title: 'Review',
            start: today.with({ month: 2, day: 10 }).toString(),
            end: today.with({ month: 2, day: 11 }).toString(),
          },
          {
            id: 'q2',
            title: 'Launch',
            start: today.with({ month: 5, day: 14 }).toString(),
            end: today.with({ month: 5, day: 15 }).toString(),
          },
          {
            id: 'q3',
            title: 'Planning week',
            start: today.with({ month: 8, day: 7 }).toString(),
            end: today.with({ month: 8, day: 11 }).toString(),
          },
          {
            id: 'q4',
            title: 'Conference',
            start: today.with({ month: 11, day: 18 }).toString(),
            end: today.with({ month: 11, day: 20 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, YearView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Planning', start: '2026-02-10', end: '2026-02-11' },
  { id: 2, title: 'Review', start: '2026-02-10', end: '2026-02-11' },
  { id: 3, title: 'Launch', start: '2026-05-14', end: '2026-05-15' },
  { id: 4, title: 'Conference', start: '2026-11-18', end: '2026-11-20' },
]
<\/script>

<template>
  <div style="height: 560px">
    <Scheduler :events="events">
      <YearView display="heatmap" />
    </Scheduler>
  </div>
</template>`,
      },
      {
        id: 'planner',
        title: 'Year planner',
        feature: 'Use one row per month to compare long-running plans across the year.',
        props: { display: 'planner' },
        events: [
          {
            id: 'design',
            title: 'Design',
            start: today.with({ month: 1, day: 6 }).toString(),
            end: today.with({ month: 3, day: 15 }).toString(),
          },
          {
            id: 'build',
            title: 'Build',
            start: today.with({ month: 3, day: 10 }).toString(),
            end: today.with({ month: 7, day: 1 }).toString(),
          },
          {
            id: 'launch',
            title: 'Launch',
            start: today.with({ month: 8, day: 1 }).toString(),
            end: today.with({ month: 9, day: 15 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, YearView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Design', start: '2026-01-06', end: '2026-03-15' },
  { id: 2, title: 'Build', start: '2026-03-10', end: '2026-07-01' },
  { id: 3, title: 'Launch', start: '2026-08-01', end: '2026-09-15' },
]
<\/script>

<template>
  <div style="height: 560px">
    <Scheduler :events="events">
      <YearView display="planner" />
    </Scheduler>
  </div>
</template>`,
      },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    component: AgendaView,
    demos: [
      {
        id: 'empty-days',
        title: 'Include empty days',
        feature: 'Keep quiet dates visible so the whole week is easy to scan.',
        props: { period: 'week', showEmptyDays: true },
        events: [
          {
            id: 'standup',
            title: 'Team stand-up',
            start: today.toPlainDateTime({ hour: 9 }).toString(),
            end: today.toPlainDateTime({ hour: 9, minute: 30 }).toString(),
          },
          {
            id: 'review',
            title: 'Design review',
            start: today.add({ days: 2 }).toPlainDateTime({ hour: 10 }).toString(),
            end: today.add({ days: 2 }).toPlainDateTime({ hour: 11 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, AgendaView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Team stand-up', start: '2026-11-03T09:00', end: '2026-11-03T09:30' },
  { id: 2, title: 'Design review', start: '2026-11-05T10:00', end: '2026-11-05T11:00' },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events">
      <AgendaView period="week" show-empty-days />
    </Scheduler>
  </div>
</template>`,
      },
      {
        id: 'month-list',
        title: 'Monthly list',
        feature: 'Show a month of upcoming work as a compact, scrollable list.',
        props: { period: 'month', showEmptyDays: false },
        events: [
          {
            id: 'kickoff',
            title: 'Kickoff',
            start: today.toPlainDateTime({ hour: 9 }).toString(),
            end: today.toPlainDateTime({ hour: 10 }).toString(),
          },
          {
            id: 'workshop',
            title: 'Planning workshop',
            start: today.add({ days: 8 }).toPlainDateTime({ hour: 13 }).toString(),
            end: today.add({ days: 8 }).toPlainDateTime({ hour: 15 }).toString(),
          },
          {
            id: 'review',
            title: 'Monthly review',
            start: today.add({ days: 18 }).toPlainDateTime({ hour: 10 }).toString(),
            end: today.add({ days: 18 }).toPlainDateTime({ hour: 11 }).toString(),
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, AgendaView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Kickoff', start: '2026-11-03T09:00', end: '2026-11-03T10:00' },
  { id: 2, title: 'Planning workshop', start: '2026-11-11T13:00', end: '2026-11-11T15:00' },
  { id: 3, title: 'Monthly review', start: '2026-11-21T10:00', end: '2026-11-21T11:00' },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events">
      <AgendaView period="month" />
    </Scheduler>
  </div>
</template>`,
      },
    ],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    component: TimelineView,
    demos: [
      {
        id: 'resources',
        title: 'Resource plan',
        feature: 'Assign date-range work to resource rows and compare overlapping phases.',
        props: { period: 'week' },
        events: [
          {
            id: 'wireframes',
            title: 'Create wireframes',
            start: monday.toString(),
            end: monday.add({ days: 2 }).toString(),
            resourceId: 'design',
          },
          {
            id: 'prototype',
            title: 'Build prototype',
            start: monday.add({ days: 2 }).toString(),
            end: monday.add({ days: 5 }).toString(),
            resourceId: 'build',
          },
          {
            id: 'testing',
            title: 'Test prototype',
            start: monday.add({ days: 4 }).toString(),
            end: monday.add({ days: 6 }).toString(),
            resourceId: 'test',
          },
        ],
        resources: projectResources,
        code: `<script setup lang="ts">
import { Scheduler, TimelineView, type SchedulerEvent, type SchedulerResource } from 'schedvueler'

const resources: SchedulerResource[] = [
  { id: 'design', title: 'Design' },
  { id: 'build', title: 'Build' },
]
const events: SchedulerEvent[] = [
  { id: 1, title: 'Wireframes', start: '2026-11-02', end: '2026-11-04', resourceId: 'design' },
  { id: 2, title: 'Prototype', start: '2026-11-04', end: '2026-11-07', resourceId: 'build' },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events" :resources="resources">
      <TimelineView period="week" />
    </Scheduler>
  </div>
</template>`,
      },
      {
        id: 'hourly',
        title: 'Hourly resource schedule',
        feature: 'Switch to an hour scale, limit the visible workday, and search resource rows.',
        props: {
          period: 'day',
          dayStartTime: '08:00',
          dayEndTime: '18:00',
          slotDuration: 120,
          resourceSearch: true,
        },
        events: [
          {
            id: 'wireframes',
            title: 'Wireframes',
            start: today.toPlainDateTime({ hour: 9 }).toString(),
            end: today.toPlainDateTime({ hour: 12 }).toString(),
            resourceId: 'design',
          },
          {
            id: 'prototype',
            title: 'Prototype review',
            start: today.toPlainDateTime({ hour: 13 }).toString(),
            end: today.toPlainDateTime({ hour: 15 }).toString(),
            resourceId: 'build',
          },
          {
            id: 'test',
            title: 'Test run',
            start: today.toPlainDateTime({ hour: 15 }).toString(),
            end: today.toPlainDateTime({ hour: 17 }).toString(),
            resourceId: 'test',
          },
        ],
        resources: projectResources,
        code: `<script setup lang="ts">
import { Scheduler, TimelineView, type SchedulerEvent, type SchedulerResource } from 'schedvueler'

const resources: SchedulerResource[] = [
  { id: 'design', title: 'Design' },
  { id: 'build', title: 'Build' },
]
const events: SchedulerEvent[] = [
  { id: 1, title: 'Wireframes', start: '2026-11-03T09:00', end: '2026-11-03T12:00', resourceId: 'design' },
  { id: 2, title: 'Prototype review', start: '2026-11-03T13:00', end: '2026-11-03T15:00', resourceId: 'build' },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events" :resources="resources">
      <TimelineView period="day" day-start-time="08:00" day-end-time="18:00" :slot-duration="120" resource-search />
    </Scheduler>
  </div>
</template>`,
      },
    ],
  },
  {
    id: 'gantt',
    label: 'Gantt',
    component: GanttView,
    demos: [
      {
        id: 'dependencies',
        title: 'Progress and dependencies',
        feature: 'Show completion progress and draw arrows from prerequisite tasks.',
        props: { period: 'month' },
        events: [
          {
            id: 'scope',
            title: 'Define scope',
            start: monday.toString(),
            end: monday.add({ days: 2 }).toString(),
            progress: 1,
          },
          {
            id: 'design',
            title: 'Design screens',
            start: monday.add({ days: 2 }).toString(),
            end: monday.add({ days: 4 }).toString(),
            progress: 0.6,
            dependsOn: ['scope'],
          },
          {
            id: 'build',
            title: 'Build prototype',
            start: monday.add({ days: 4 }).toString(),
            end: monday.add({ days: 7 }).toString(),
            progress: 0.25,
            dependsOn: ['design'],
          },
        ],
        code: `<script setup lang="ts">
import { Scheduler, GanttView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 'scope', title: 'Define scope', start: '2026-11-02', end: '2026-11-04', progress: 1 },
  { id: 'design', title: 'Design screens', start: '2026-11-04', end: '2026-11-06', progress: 0.6, dependsOn: ['scope'] },
  { id: 'build', title: 'Build prototype', start: '2026-11-06', end: '2026-11-09', progress: 0.25, dependsOn: ['design'] },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events">
      <GanttView period="month" />
    </Scheduler>
  </div>
</template>`,
      },
      {
        id: 'milestones',
        title: 'Milestones and header tiers',
        feature: 'Use no end date for a milestone and add month/week headers for context.',
        props: { period: 'month', headerTiers: ['month', 'week'] },
        events: [
          {
            id: 'design',
            title: 'Design phase',
            start: monday.toString(),
            end: monday.add({ days: 4 }).toString(),
            progress: 0.8,
          },
          { id: 'launch', title: 'Launch', start: monday.add({ days: 8 }).toString() },
        ],
        code: `<script setup lang="ts">
import { Scheduler, GanttView, type SchedulerEvent } from 'schedvueler'

const events: SchedulerEvent[] = [
  { id: 1, title: 'Design phase', start: '2026-11-02', end: '2026-11-06', progress: 0.8 },
  { id: 2, title: 'Launch', start: '2026-11-10' },
]
<\/script>

<template>
  <div style="height: 480px">
    <Scheduler :events="events">
      <GanttView period="month" :header-tiers="['month', 'week']" />
    </Scheduler>
  </div>
</template>`,
      },
    ],
  },
]

const activeView = computed(() => examples.find((example) => example.id === view.value)!)
const activeDemo = computed(
  () =>
    activeView.value.demos.find((demo) => demo.id === demoId.value) ?? activeView.value.demos[0]!,
)
const activeCode = computed(() =>
  activeDemo.value.code.replace(
    '<script setup lang="ts">',
    `<script setup lang="ts">\nimport 'schedvueler/style.css'`,
  ),
)

function selectView(id: ViewId) {
  view.value = id
  demoId.value = examples.find((example) => example.id === id)!.demos[0]!.id
  copied.value = false
}

function selectDemo(id: string) {
  demoId.value = id
  copied.value = false
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(activeCode.value)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <main class="examples-page">
    <header class="examples-page__header">
      <nav aria-label="Playground pages">
        <a href="#/">Full playground</a>
        <a href="#/parts">Slots and parts</a>
      </nav>
      <h1>Scheduler view examples</h1>
      <p>Choose a view, then switch between implementations to compare its features.</p>
    </header>

    <nav class="examples-page__views" role="tablist" aria-label="Scheduler views">
      <button
        v-for="example in examples"
        :key="example.id"
        type="button"
        role="tab"
        :aria-selected="view === example.id"
        :class="{ 'is-active': view === example.id }"
        @click="selectView(example.id)"
      >
        {{ example.label }}
      </button>
    </nav>

    <section class="examples-page__demo" role="tabpanel">
      <div class="examples-page__demo-heading">
        <div>
          <h2>{{ activeDemo.title }}</h2>
          <p>{{ activeDemo.feature }}</p>
        </div>
      </div>

      <div
        class="examples-page__variants"
        role="group"
        :aria-label="`${activeView.label} implementations`"
      >
        <button
          v-for="demo in activeView.demos"
          :key="demo.id"
          type="button"
          :aria-pressed="demoId === demo.id"
          :class="{ 'is-active': demoId === demo.id }"
          @click="selectDemo(demo.id)"
        >
          {{ demo.title }}
        </button>
      </div>

      <div
        class="examples-page__scheduler"
        :aria-label="`${activeView.label}: ${activeDemo.title}`"
      >
        <Scheduler
          v-model:date="date"
          v-model:view="view"
          :events="activeDemo.events"
          :resources="activeDemo.resources"
          :week-start="1"
          locale="en-GB"
        >
          <template #view-switcher></template>
          <component
            :is="activeView.component"
            :name="view"
            :label="activeView.label"
            v-bind="activeDemo.props"
          />
        </Scheduler>
      </div>
    </section>

    <section class="examples-page__code" aria-labelledby="code-heading">
      <div class="examples-page__code-heading">
        <h2 id="code-heading">Vue implementation</h2>
        <button type="button" @click="copyCode">{{ copied ? 'Copied' : 'Copy code' }}</button>
      </div>
      <pre><code>{{ activeCode }}</code></pre>
    </section>
  </main>
</template>

<style scoped>
.examples-page {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 100%;
  overflow-x: clip;
  padding: 28px clamp(16px, 4vw, 56px);
  color: #17211b;
  background: #f5f7f4;
  font-family: Inter, system-ui, sans-serif;
}

.examples-page__header,
.examples-page__views,
.examples-page__demo,
.examples-page__code,
.examples-page__scheduler {
  width: min(100%, 1120px);
  margin-inline: auto;
}

.examples-page__header nav {
  display: flex;
  gap: 20px;
  margin-bottom: 36px;
  font-size: 14px;
}

.examples-page a {
  color: #175c43;
  text-underline-offset: 3px;
}

.examples-page h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 650;
}

.examples-page__header p {
  margin: 8px 0 20px;
  color: #526057;
}

.examples-page__views,
.examples-page__variants {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.examples-page__views {
  margin-bottom: 20px;
  border-bottom: 1px solid #d5ddd7;
}

.examples-page__views button,
.examples-page__variants button {
  min-height: 40px;
  padding: 8px 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  color: #526057;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.examples-page__views button.is-active {
  border-bottom-color: #175c43;
  color: #175c43;
  font-weight: 650;
}

.examples-page__variants {
  margin: 0 0 14px;
}

.examples-page__variants button {
  border: 1px solid #bac8bf;
  border-radius: 4px;
  background: #fff;
}

.examples-page__variants button.is-active {
  border-color: #175c43;
  color: #175c43;
  background: #e7f1eb;
}

.examples-page__views button:focus-visible,
.examples-page__variants button:focus-visible,
.examples-page__code button:focus-visible {
  outline: 2px solid #175c43;
  outline-offset: 2px;
}

.examples-page__demo-heading h2,
.examples-page__code-heading h2 {
  margin: 0;
  font-size: 18px;
}

.examples-page__demo-heading p {
  margin: 5px 0 12px;
  color: #526057;
}

.examples-page__scheduler {
  height: min(56vh, 500px);
  min-height: 340px;
}

.examples-page__code {
  margin-top: 24px;
  overflow-x: clip;
}

.examples-page__code-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.examples-page__code button {
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid #bac8bf;
  border-radius: 4px;
  color: #175c43;
  background: #fff;
  font: inherit;
  cursor: pointer;
}

.examples-page__code pre {
  box-sizing: border-box;
  max-height: 460px;
  overflow: auto;
  margin: 0;
  padding: 18px;
  border: 1px solid #d5ddd7;
  border-radius: 4px;
  color: #17211b;
  background: #fff;
  font:
    13px/1.6 'Cascadia Code',
    'SFMono-Regular',
    Consolas,
    monospace;
  tab-size: 2;
}

.examples-page__code code {
  white-space: pre;
}

@media (max-width: 520px) {
  .examples-page {
    padding-top: 20px;
  }

  .examples-page__header nav {
    margin-bottom: 28px;
  }

  .examples-page__views,
  .examples-page__variants {
    gap: 0;
  }

  .examples-page__views button,
  .examples-page__variants button {
    padding-inline: 9px;
  }

  .examples-page__scheduler {
    min-height: 320px;
  }

  .examples-page__code pre {
    padding: 14px;
    font-size: 12px;
  }
}
</style>
