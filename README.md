# orb-scheduler

Modular scheduler and calendar components for Vue 3: views as child components, a slot for every
part, typed emits, full RRULE recurrence and time-zone support, and a framework-free core.

> Status: in development. Phases 1–4 of [RESEARCH.md](RESEARCH.md) are done (core, root component,
> day/week/N-day/month/agenda views, drag/resize/select, keyboard, responsive and touch). The
> resource timeline is next.

## Quick start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Scheduler, DayView, WeekView, MonthView, AgendaView, type SchedulerEvent } from 'orb-scheduler'
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
    <AgendaView />
  </Scheduler>
</template>
```

## Responsive and mobile

```vue
<Scheduler :events="events" drill-down-view="day">
  <DayView />
  <WeekView :min-width="600" />   <!-- only offered when the scheduler is at least 600px wide -->
  <MonthView />                   <!-- below compact-width (560px) days show dots; tap for the list -->
  <AgendaView period="week" />    <!-- virtualized list grouped by day -->
</Scheduler>
```

- `min-width` / `max-width` on any view hide it from the switcher when the scheduler does not fit.
  If the chosen view does not fit, the first one that does is shown; `v-model:view` keeps your
  choice, so it comes back when there is room again.
- Layout tweaks use container queries on the scheduler's own width, so it also adapts inside
  narrow panels on a wide screen.
- Touch: swipe left/right to change period (`swipe-navigation`), long-press to drag or select,
  larger resize handles on coarse pointers.
- `drill-down-view` opens that view when a date is clicked (day header, month day number, agenda
  day); `date-click` is cancelable.

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

## Editing

```vue
<Scheduler :events="events" editable selectable @event-drop="onChange" @event-resize="onChange"
  @event-delete="onDelete" @select="onSelect" />
```

```ts
import { applyEventEdit, removeEventOccurrence } from 'orb-scheduler'

function onChange(p: EventChangedPayload<SchedulerEvent>) {
  // For recurring events p.scope says "this", "following" or "all".
  events.value = applyEventEdit(events.value, p.occurrence, p, { scope: p.scope, timeZone })
}
```

- The scheduler shows the new position immediately and keeps it until `events` changes; call
  `p.revert()` if saving fails.
- `before-event-drop` / `before-event-resize` are cancelable and can wait for a promise (e.g. a
  "this / following / all" dialog); set `p.scope` there.
- `canDrag`, `canResize`, `canDrop` and `canSelect` decide per event or per spot; refused spots
  show the preview in red and the drop reverts.
- Touch: long-press (`longPressDelay`, 400 ms) starts a drag or selection, so scrolling still works.

### Keyboard

| Keys | Action |
| --- | --- |
| Arrows | Move focus over slots / day cells (past the edge goes to the previous/next period) |
| Shift + arrows, then Enter | Select a range |
| Enter / Space | Click the focused slot or event |
| Alt + arrows | Move the focused event by a snap step / a day |
| Alt + Shift + arrows | Resize the focused event |
| Delete / Backspace | `event-delete` for the focused event |
| PageUp / PageDown, T | Previous / next period, today |
| Alt + 1…9 | Switch view |
| Escape | Cancel a drag, clear the selection |

Changes are announced to screen readers through a live region; texts are in `messages`.

## Emits

`range-change` (load data for the visible range), `navigate` and `view-change` (cancelable),
`event-click` / `-dblclick` / `-contextmenu` / `-mouseenter` / `-mouseleave` / `-keydown`,
`slot-click` / `-dblclick` / `-contextmenu`, `date-click`, `more-click` (cancelable),
`event-drag-start` (cancelable), `event-drag`, `event-drag-cancel`, `before-event-drop` /
`event-drop`, `before-event-resize` / `event-resize`, `event-delete`, `select`, `unselect`, plus
`update:date` and `update:view` for `v-model`.

Cancelable payloads have `preventDefault()` and `waitUntil(promise)`.

## Slots

`toolbar`, `toolbar-start`, `toolbar-center`, `toolbar-end`, `title`, `event`, `event-content`,
`time-event`, `all-day-event`, `month-event`, `day-header`, `all-day-label`, `time-label`,
`time-slot`, `month-weekday`, `month-cell`, `more-link`, `more-popover`, `now-indicator`,
`agenda-event`, `agenda-day-header`, `agenda-empty`.
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
