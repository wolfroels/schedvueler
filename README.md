# orb-scheduler

Modular scheduler and calendar components for Vue 3: views as child components, a slot for every
part, typed emits, full RRULE recurrence and time-zone support, and a framework-free core.

> Status: in development. Phases 1–2 of [RESEARCH.md](RESEARCH.md) are done (core, root component,
> day/week/N-day/month views). Drag & drop, agenda/mobile and the resource timeline are next.

## Quick start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Scheduler, DayView, WeekView, MonthView, type SchedulerEvent } from 'orb-scheduler'
import 'orb-scheduler/style.css'

const events = ref<SchedulerEvent[]>([
  { id: 1, title: 'Planning', start: '2026-10-29T09:00', end: '2026-10-29T10:30' },
  { id: 2, title: 'Conference', start: '2026-11-02', end: '2026-11-05' }, // all-day, end exclusive
  {
    id: 3,
    title: 'Stand-up',
    start: '2026-10-05T09:00',
    end: '2026-10-05T09:15',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  },
])
const view = ref('week')
</script>

<template>
  <Scheduler v-model:view="view" :events="events" time-zone="Europe/Brussels" style="height: 700px">
    <DayView />
    <WeekView />
    <WeekView name="workweek" :days="5" label="Work week" />
    <MonthView />
  </Scheduler>
</template>
```

Views register themselves in the order they are declared; the first one is the default. Toggle a
view with `v-if`, give it its own settings with props (`slot-duration`, `day-start-time`,
`hidden-days`, ...), and give it its own slots to override the scheduler-wide ones.

## Dates

| Value | Meaning |
| --- | --- |
| `'2026-10-29'` | a date (all-day) |
| `'2026-10-29T09:00'` | wall-clock time in the event's `timezone` (or the scheduler's) |
| `'2026-10-29T08:00Z'`, `'...+01:00'`, `'...[Europe/Brussels]'` | an exact moment |
| `Date`, epoch ms, `Temporal.*` | also accepted |

All-day `end` dates are exclusive. Emit payloads carry `Temporal` values (`PlainDate`,
`ZonedDateTime`).

## Your own event shape

```ts
import { createAccessors } from 'orb-scheduler'

const accessors = { id: (b: Booking) => b.bookingId, start: (b) => b.from, end: (b) => b.to }
// <Scheduler :events="bookings" :accessors="accessors">
```

Treat event objects as immutable: replace an object (or the array) to change it. Unchanged objects
are not re-read, so adding one event to 10 000 is cheap.

## Emits

`range-change` (load data for the visible range), `navigate` and `view-change` (cancelable),
`event-click` / `-dblclick` / `-contextmenu` / `-mouseenter` / `-mouseleave` / `-keydown`,
`slot-click` / `-dblclick` / `-contextmenu`, `date-click`, `more-click` (cancelable), plus
`update:date` and `update:view` for `v-model`.

Cancelable payloads have `preventDefault()` and `waitUntil(promise)`.

## Slots

`toolbar`, `toolbar-start`, `toolbar-center`, `toolbar-end`, `title`, `event`, `event-content`,
`time-event`, `all-day-event`, `month-event`, `day-header`, `all-day-label`, `time-label`,
`time-slot`, `month-weekday`, `month-cell`, `more-link`, `more-popover`, `now-indicator`.
See `SchedulerSlots` in [src/types.ts](src/types.ts) for the props each one receives.

## Theming

Everything is a CSS custom property on `.orb-scheduler`; see the top of
[src/styles/scheduler.css](src/styles/scheduler.css). For example:

```css
.orb-scheduler {
  --orb-color-accent: #0f766e;
  --orb-slot-height: 3rem;
  --orb-event-radius: 4px;
  --orb-month-event-height: 1.5rem;
}
```

`theme="dark"` or `theme="auto"` switches the color set. Per-event colors come from the `color`
field (or the `color` accessor).

## Headless use

`orb-scheduler/core` has no Vue dependency: `EventStore`, RRULE parsing and expansion, range
strategies, and layout algorithms. The composables (`useScheduler`, `useSchedulerView`,
`useTimeGrid`, `useMonthGrid`) give you the state and layout without any markup.

## Development

```sh
npm install
npm run dev        # playground on http://localhost:6173
npm test           # unit tests, against native Temporal and the polyfill
npm run build      # type-check + library build into dist/
npm run lint
```
