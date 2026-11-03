# orb-scheduler

Modular scheduler and calendar components for Vue 3: views as child components, a slot for every
part, typed emits, full RRULE recurrence and time-zone support, and a framework-free core.

> Status: in development. All six phases of [RESEARCH.md](RESEARCH.md) are done: core, root
> component, day/week/N-day/month/year/agenda/timeline views, drag/resize/select, keyboard,
> responsive and touch, resources, undo/redo and a performance pass. The full reference is in
> [docs/API.md](docs/API.md). What comes next is in [ROADMAP.md](ROADMAP.md).

## GitHub Pages

The documentation and playground can be hosted together on GitHub Pages:

- Documentation: https://wolfroels.github.io/orbid-scheduler/
- Playground: https://wolfroels.github.io/orbid-scheduler/playground/

In the repository's **Settings > Pages**, choose **GitHub Actions** as the build and deployment
source. Push to `main`, or run **Deploy GitHub Pages** manually from the Actions tab. The
workflow builds the library, documentation, and playground, then publishes one Pages artifact.
The URLs become available after the first successful deployment.

The workflow reads the repository base path from GitHub Pages, so asset URLs work under the
repository subdirectory and on custom domains. Local builds still default to `/`. To reproduce
the deployed builds in PowerShell:

```powershell
npm ci
npm run build-only
$env:PAGES_BASE_PATH = '/orbid-scheduler/'
npm run docs:build
$env:PAGES_BASE_PATH = '/orbid-scheduler/playground/'
npm run playground:build
Remove-Item Env:PAGES_BASE_PATH
```

The playground uses hash routing, so its views do not need server-side rewrite rules. Saved
preferences stay local to each browser and origin; local development preferences do not carry
over to the deployed site. The scheduler library itself is not published to npm by this workflow.

## Quick start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  Scheduler,
  DayView,
  WeekView,
  MonthView,
  AgendaView,
  type SchedulerEvent,
} from 'orb-scheduler'
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
  <YearView display="heatmap" />  <!-- twelve small months, shaded by number of events -->
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

## Resources and the timeline

```vue
<Scheduler :events="events" :resources="resources" editable selectable>
  <TimelineView />                                    <!-- one day, hourly columns -->
  <TimelineView name="tl-week" period="week" />       <!-- one column per day -->
  <DayView name="crews" :resources="['crew-1', 'crew-2']" />
  <WeekView name="rooms" resources group-by="date" />
</Scheduler>
```

```ts
const resources: SchedulerResource[] = [
  { id: 'cranes', title: 'Cranes', color: '#ea580c' },
  { id: 'crane-1', title: 'Tower crane 1', parentId: 'cranes' }, // inherits the group color
]
const events = [{ id: 1, start: '...', end: '...', resourceId: 'crane-1' }] // or resourceIds: [...]
```

- **Timeline**: a row per resource, events stacked in lanes, groups (`parentId`) that expand and
  collapse. Only the visible rows are rendered, so hundreds of resources stay fast; use
  `visible-resources-change` to load events for just the rows on screen. Props: `period`
  (`day` / `week` / `month`) or `days`, `slot-duration` (1440 = day columns), `slot-width`,
  `day-start-time` / `day-end-time`, `event-height`, `row-min-height`, `resource-area-width`,
  `resource-ids`.
- **Resource columns**: `resources` on `DayView` / `WeekView` shows a column per resource (all
  resources without children for `true`, or a list of ids); `group-by="date"` puts the resources
  inside each day instead. Set `--orb-tg-column-min-width` to scroll sideways instead of squeezing.
- Dragging to another row or column moves the event to that resource: `event-drop` carries
  `resourceIds` and `oldResourceIds`, `applyEventEdit` writes them, `select` and slot clicks
  carry `resourceId`. On a timeline, Alt + up/down moves the focused event to the previous/next
  row.
- Events without a color use their resource's color. Events without a resource do not show in
  resource views. Custom resource shapes work with `resource-accessors`.

## Dates

| Value                                                          | Meaning                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `'2026-10-29'`                                                 | a date (all-day)                                               |
| `'2026-10-29T09:00'`                                           | wall-clock time in the event's `timezone` (or the scheduler's) |
| `'2026-10-29T08:00Z'`, `'...+01:00'`, `'...[Europe/Brussels]'` | an exact moment                                                |
| `Date`, epoch ms, `Temporal.*`                                 | also accepted                                                  |

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
<Scheduler
  :events="events"
  editable
  selectable
  @event-drop="onChange"
  @event-resize="onChange"
  @event-delete="onDelete"
  @select="onSelect"
/>
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

### Dragging new events in

```vue
<li v-orb-draggable="{ title: 'Inspection', duration: 90, data: job }">Inspection</li>
<Scheduler :events="events" @event-receive="(p) => addEvent(p)" />
```

Any element outside the scheduler can be dragged into any view: the scheduler shows where it
would land and `event-receive` gives you `start`, `end`, `allDay`, `resourceId` and your
`data`. Details in [docs/API.md](docs/API.md#dragging-in-from-outside).

### Undo and redo

```ts
import { useHistory } from 'orb-scheduler'

const history = useHistory(events, { keyboard: true }) // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y

function onChange(p: EventChangedPayload<SchedulerEvent>) {
  history.commit(
    applyEventEdit(events.value, p.occurrence, p, { scope: p.scope, timeZone }),
    'Move',
  )
}
// history.undo(), history.redo(), history.canUndo.value, history.undoLabel.value, history.reset()
```

Snapshots share unchanged event objects, so keeping 100 steps of a 10 000-event array is cheap.

### Keyboard

| Keys                       | Action                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrows                     | Move focus over slots / day cells (past the edge goes to the previous/next period)                                                                                                    |
| Shift + arrows, then Enter | Select a range                                                                                                                                                                        |
| Enter / Space              | Click the focused slot or event                                                                                                                                                       |
| Alt + arrows               | Move the focused event by a snap step / a day (timeline: left/right in time, up/down to another resource). Focus stays on the event, and the view follows it out of the visible range |
| Alt + Shift + arrows       | Resize the focused event                                                                                                                                                              |
| Delete / Backspace         | `event-delete` for the focused event                                                                                                                                                  |
| PageUp / PageDown, T       | Previous / next period, today                                                                                                                                                         |
| Alt + 1…9                  | Switch view                                                                                                                                                                           |
| Escape                     | Cancel a drag, clear the selection                                                                                                                                                    |

Changes are announced to screen readers through a live region; texts are in `messages`.

## Emits

`range-change` (load data for the visible range), `navigate` and `view-change` (cancelable),
`event-click` / `-dblclick` / `-contextmenu` / `-mouseenter` / `-mouseleave` / `-keydown`,
`slot-click` / `-dblclick` / `-contextmenu`, `date-click`, `more-click` (cancelable),
`event-drag-start` (cancelable), `event-drag`, `event-drag-cancel`, `before-event-drop` /
`event-drop`, `before-event-resize` / `event-resize`, `event-delete`, `select`, `unselect`,
`resource-click`, `resource-toggle`, `visible-resources-change`, plus `update:date` and
`update:view` for `v-model`.

Cancelable payloads have `preventDefault()` and `waitUntil(promise)`.

## Slots

`toolbar`, `toolbar-start`, `toolbar-center`, `toolbar-end`, `title`, `event`, `event-content`,
`time-event`, `all-day-event`, `month-event`, `day-header`, `all-day-label`, `time-label`,
`time-slot`, `month-weekday`, `month-cell`, `more-link`, `more-popover`, `now-indicator`,
`agenda-event`, `agenda-day-header`, `agenda-empty`, `timeline-event`, `timeline-header`,
`resource-label`, `resource-area-header`, `year-day`, `year-month-header`, `nav-prev`, `nav-next`,
`today-button`, `view-switcher`, `view-button`, `drag-preview`, `resize-handle`, `selection`,
`month-day-number`.
See [docs/API.md](docs/API.md#slots) for the props each one receives.

## More

The [human guide](docs/guide.md) covers setup and common workflows. The
[AI implementation guide](docs/ai-implementation.md) gives coding assistants a focused integration
workflow. Availability rules, multi-select and group edits, clipboard, Gantt and dependency
arrows, iCalendar import and export, free-time search, drafts, a mini calendar and more are
described in [docs/API.md](docs/API.md). [docs/RECIPES.md](docs/RECIPES.md) has short answers for
editor dialogs, loading and saving, and syncing with calendars; [docs/CUSTOM_VIEWS.md](docs/CUSTOM_VIEWS.md)
shows how to write your own view.

## Passthrough

Every element has a part name. `:pt="{ todayButton: { class: 'my-button' } }"` adds classes, styles,
attributes or listeners to it without replacing it; a function gets details per element. The
playground's slots and parts page (`npm run dev`, then `#/parts`) shows on a live scheduler what
each part and slot is called and what connects to what. See
[docs/API.md](docs/API.md#passthrough-pt).

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
strategies, resource trees, and layout algorithms (time grid, day rows, timeline). The
composables (`useScheduler`, `useSchedulerView`, `useTimeGrid`, `useMonthGrid`, `useTimeline`,
`useYearGrid`, `useHistory`) give you the state and layout without any markup.

## Development

```sh
npm install
npm run dev        # playground on http://localhost:6173
npm test           # unit tests, against native Temporal and the polyfill
npm run test:e2e   # browser tests in Chromium, Firefox and WebKit (first: npx playwright install)
npm run build      # type-check + library build into dist/
npm run lint
npm run playground:build && npm run playground:preview   # production playground, for measuring
```
