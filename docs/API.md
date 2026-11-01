# orb-scheduler API reference

Everything below is exported from `orb-scheduler`; the framework-free parts are also available
from `orb-scheduler/core`. Types are in [src/types.ts](../src/types.ts) and
[src/core](../src/core); this page is the overview.

- [`<Scheduler>`](#scheduler)
- [Views](#views)
- [Emits](#emits)
- [Slots](#slots)
- [Passthrough (`pt`)](#passthrough-pt)
- [Theming (CSS variables)](#theming)
- [Editing helpers and undo/redo](#editing-helpers)
- [Dragging new events in from outside](#dragging-in-from-outside)
- [Headless use](#headless-use)
- [Performance](#performance)

## `<Scheduler>`

The root component. Views are its children; the first one is the default.

```vue
<Scheduler v-model:date="date" v-model:view="view" :events="events" time-zone="Europe/Brussels">
  <WeekView />
  <MonthView />
</Scheduler>
```

### Models

| Model | Type | Meaning |
| --- | --- | --- |
| `v-model:date` | `string` (`YYYY-MM-DD`) | Anchor date. Unbound: today. |
| `v-model:view` | `string` | Active view name. Unbound: the first view. A view that does not fit the width is replaced by the first that does, without changing this value. |

### Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `events` | `T[]` | – | Events. Treat them as immutable: replace an object or the array to change it. |
| `accessors` | `Partial<EventAccessors<T>>` | field names of `SchedulerEvent` | Read fields from your own event shape. |
| `resources` | `unknown[]` | `[]` | Resources for the timeline and resource columns. |
| `resource-accessors` | `Partial<ResourceAccessors<R>>` | field names of `SchedulerResource` | Read fields from your own resource shape. |
| `time-zone` | `string` | browser zone | Display zone (IANA). |
| `event-time-zone` | `string` | `time-zone` | Zone for event times without offset or own `timezone`. |
| `locale` | `string` | browser locale | BCP 47 locale for all formatting. |
| `week-start` | `number` | locale's | ISO weekday the week starts on (1 = Monday). |
| `hidden-days` | `number[]` | `[]` | ISO weekdays to hide, e.g. `[6, 7]`. |
| `hour12` | `boolean` | locale's | Force a 12- or 24-hour clock. |
| `slot-duration` | `number` | `30` | Minutes per time-grid slot. |
| `slot-label-interval` | `number` | `60` | Minutes between time labels. |
| `day-start-time` / `day-end-time` | `"HH:mm"` | `00:00` / `24:00` | Visible hours in time grids. |
| `scroll-time` | `"HH:mm"` | `08:00` | Time scrolled into view when a time grid opens. |
| `default-event-duration` | `number` | `60` | Minutes for timed events without an end. |
| `event-layout` | `'columns' \| 'stack' \| fn` | `'columns'` | How overlapping timed events share a column. |
| `event-order` | `(a, b) => number` | all-day first, start, longest | Order of events within a day. |
| `event-attrs` | `(occurrence) => attrs` | – | Extra class, style or attributes per event (pure function). |
| `slot-attrs` | `(info) => attrs` | – | Extra class, style or attributes per cell. |
| `business-hours` | `BusinessHours` | – | Opening hours, `{ days?, start, end }` or a list. Everything else is shaded. A resource's own `businessHours` wins. |
| `business-hours-only` | `boolean` | `false` | Refuse changes outside business hours. |
| `blocked-times` | `BlockedTime[]` | – | `{ start, end, resourceId?, resourceIds?, title? }`. Drawn, and nothing can be placed there. |
| `is-slot-disabled` | `(info) => boolean` | – | Refuses ranges by your own rule. |
| `min-date` / `max-date` | `string` | – | Limits for navigation and edits, inclusive. |
| `event-overlap` | `'allow' \| 'forbid' \| (info) => boolean` | `'allow'` | Whether events may overlap after a change. Events with resources only conflict when they share one. |
| `duration-limits` | `{ min?, max? } \| (occurrence) => { min?, max? }` | – | Length limits in minutes, for resizes and selections. |
| `pt` | `SchedulerPt` | – | Attributes for any part of the scheduler. See [Passthrough](#passthrough-pt). |
| `now-indicator` | `boolean` | `true` | Current-time line. |
| `messages` | `Partial<SchedulerMessages>` | English | All texts, including screen-reader announcements. |
| `editable` | `boolean` | `false` | Drag and resize events. |
| `event-draggable` / `event-resizable` | `boolean` | `editable` | Override `editable` per action. |
| `selectable` | `boolean` | `false` | Select a range by dragging over empty slots. |
| `snap-duration` | `number` | `slot-duration` | Minutes that drags and selections snap to. |
| `can-drag` / `can-resize` | `(occurrence) => boolean` | – | Per-event permission. |
| `can-drop` | `(info: DropInfo) => boolean` | – | Whether a move or resize may end here (`info` has the new `start`, `end`, `allDay`, `resourceIds`). Refused spots show in red and revert. |
| `can-select` | `(info: SelectInfo) => boolean` | – | Whether a range may be selected. |
| `can-receive` | `(info: ReceiveInfo) => boolean` | – | Whether an event dragged in from outside may be dropped here (`info` has `start`, `end`, `allDay`, `resourceId`, `template`). |
| `recurrence-edit-scope` | `'this' \| 'following' \| 'all'` | `'this'` | Scope proposed for changes to recurring events. |
| `long-press-delay` | `number` | `400` | Touch: ms to press before a drag or selection starts. |
| `drill-down-view` | `string` | – | View opened when a date is clicked. |
| `swipe-navigation` | `boolean` | `true` | Touch: swipe left/right to change period. |
| `date-adapter` | `{ parse }` | Temporal | Parse other date types in event fields. |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color set. |
| `toolbar` | `boolean` | `true` | Built-in toolbar (replace it with the `toolbar` slot). |

### Exposed methods (template ref)

`prev()`, `next()`, `today()`, `goTo(date)`, `setView(name)`, `refresh()` (re-read events
mutated in place), `clearSelection()`, and `context` (the full headless context).

Also: `scrollToTime('HH:mm')`, `scrollToEvent(id)` (goes to the date and scrolls; resolves to `false` when not found within a year) and `getEvents(start?, end?)`.

### Event shape

Besides the fields below, events can have `display: 'background'` (drawn behind the others, as a holiday), `editable`, `draggable`, `resizable` (these override the scheduler's options), `class` and `textColor`.

```ts
interface SchedulerEvent {
  id: string | number
  title?: string
  start: DateInput          // '2026-10-29' (date), '2026-10-29T09:00' (wall clock),
  end?: DateInput | null    // '...Z' / '...+01:00' / '...[Europe/Brussels]' (exact), Date, ms, Temporal
  allDay?: boolean          // defaults to true for date-only starts
  timezone?: string         // zone of wall-clock times and the recurrence rule
  resourceId?: ResourceId
  resourceIds?: ResourceId[]
  rrule?: string | null     // RFC 5545, e.g. 'FREQ=WEEKLY;BYDAY=MO,WE'
  exdates?: DateInput[]
  rdates?: DateInput[]
  recurringEventId?: string | number  // marks an edited occurrence of that series
  recurrenceId?: DateInput            // ... replacing the occurrence that started here
  color?: string
}
```

All-day `end` dates are exclusive. Emit payloads carry `Temporal` values.

## Views

Every view takes `name`, `label` (switcher text), and `min-width` / `max-width` (px; only offered
when the scheduler fits). Per-view props override the scheduler-wide options. Views also accept the
same slots as `<Scheduler>`, which win over the scheduler's for that view.

### `<DayView>` and `<WeekView>` (time grid)

| Prop | Default | Meaning |
| --- | --- | --- |
| `days` | Day: `1`, Week: `7` | Day view: consecutive days. Week view: days from the week start (`5` = work week). |
| `week-start` | scheduler's | Week view only. |
| `slot-duration`, `slot-label-interval`, `day-start-time`, `day-end-time`, `scroll-time`, `hidden-days`, `event-layout` | scheduler's | Time-grid settings for this view. |
| `all-day-slot` | `true` | Show the all-day row. |
| `resources` | – | `true` for a column per resource without children, or a list of resource ids. |
| `group-by` | `'resource'` | With resources: days within each resource, or `'date'` for resources within each day. |

### `<MonthView>`

| Prop | Default | Meaning |
| --- | --- | --- |
| `max-event-rows` | `'auto'` | Rows per day cell including "+N more"; `auto` fits the cell height. |
| `compact-width` | `560` | Below this scheduler width days show dots and tapping lists the events. `0` turns it off. |
| `fixed-weeks` | `false` | Always six weeks. |
| `week-start`, `hidden-days` | scheduler's | |

### `<YearView>`

| Prop | Default | Meaning |
| --- | --- | --- |
| `display` | `'dots'` | `'dots'` marks days with events; `'heatmap'` shades them by count (relative to the busiest day). |
| `month-view` | `'month'` | View opened when a month name is clicked, if it exists. Days use `drill-down-view`. |
| `week-start`, `hidden-days` | scheduler's | |

Arrow keys move over the days (crossing into the next or previous year), Enter opens the day.

### `<AgendaView>`

| Prop | Default | Meaning |
| --- | --- | --- |
| `period` | `'week'` | `'day'`, `'week'` or `'month'`. |
| `days` | – | Consecutive days from the date; overrides `period`. |
| `show-empty-days` | `false` | List days without events too. |
| `virtual` | `true` | Render only the visible rows. |
| `day-header-height` / `event-row-height` | `36` / `44` | Row heights in px (used for virtual scrolling). |
| `hidden-days` | scheduler's | |

### `<TimelineView>`

| Prop | Default | Meaning |
| --- | --- | --- |
| `period` | `'day'` | `'day'`, `'week'` or `'month'`. |
| `days` | – | Consecutive days; overrides `period`. |
| `slot-duration` | day: `60`, else `1440` | Minutes per column; `1440` gives a column per day. |
| `slot-label-interval` | `60` | Minutes between slot labels. |
| `snap-duration` | scheduler's, or a day for day columns | Minutes that drags snap to. |
| `day-start-time` / `day-end-time` | scheduler's | Visible hours with sub-day columns. |
| `scroll-time` | scheduler's | Scrolled into view on open. |
| `slot-width` | `64`, or `120` for day columns | Column width in px; columns stretch when there is room. |
| `resource-area-width` | `12rem` | Width of the resource column (any CSS length). |
| `event-height` / `row-min-height` | `28` / `44` | px. |
| `resource-ids` | all | Only show these resources. |
| `virtual` | `true` | Render only the visible rows. |

Resources with `parentId` form collapsible groups; children inherit the group's `color`, and
events without a color use their resource's. On a timeline, Alt+up/down moves the focused event to
the previous/next row.

## Emits

Cancelable payloads (marked ✋) have `preventDefault()` and `waitUntil(promise)`; the action is
cancelled when the promise rejects or resolves to `false`.

| Emit | Payload highlights |
| --- | --- |
| `range-change` | `view`, `start`, `end` (dates), `activeStart`, `activeEnd`, `startMs`, `endMs`, `timeZone`. Load data here. |
| `navigate` ✋ | `view`, `from`, `to`, `reason` (`prev`, `next`, `today`, `date`) |
| `view-change` ✋ | `from`, `to` |
| `event-click`, `event-dblclick`, `event-contextmenu`, `event-mouseenter`, `event-mouseleave` | `occurrence`, `event`, `view`, `nativeEvent`, `element` |
| `event-keydown` | same, with a `KeyboardEvent` |
| `slot-click`, `slot-dblclick`, `slot-contextmenu` | `view`, `date`, `start`, `end`, `allDay`, `resourceId?`, `nativeEvent`, `element` |
| `date-click` ✋ | `view`, `date`; preventing it stops the drill-down |
| `more-click` ✋ | `date`, `occurrences`, `hiddenCount`; preventing it keeps the popover closed |
| `event-drag-start` ✋ | `occurrence`, `kind` (`move`, `resize-start`, `resize-end`) |
| `event-drag` | where the event would land now: `start`, `end`, `allDay`, `resourceIds`, `valid` |
| `event-drag-cancel` | `reason`: `escape`, `invalid`, `unchanged`, `outside` (a moved event let go off the scheduler) or `prevented` |
| `before-event-drop` ✋, `before-event-resize` ✋ | old and new `start` / `end` / `allDay` / `resourceIds`, `recurring`, `scope` (set it here) |
| `event-drop`, `event-resize` | the same plus `revert()`. Update your data; call `revert()` if saving fails. |
| `before-event-delete` | Same as `event-delete`, cancelable |
| `event-delete` | `occurrence`, `recurring`, `scope`, `element` (Delete/Backspace on an editable event) |
| `event-change-failed` | `occurrence`, `kind`, `reason`, `start`, `end`, `allDay`, `resourceIds` (a rule refused a move or resize) |
| `select` | `start`, `end`, `allDay`, `resourceId?`, `getElement()` |
| `before-event-receive` ✋ | an event dragged in from outside is about to be dropped: `start`, `end`, `allDay`, `resourceIds`, `resourceId`, `template`, `data` |
| `event-receive` | the same, after the drop. Add the event to your data. |
| `unselect` | – |
| `resource-click` | `resource` (node with `id`, `title`, `depth`, ...), `view` |
| `resource-toggle` | `resource`, `expanded` |
| `visible-resources-change` | `view`, `resourceIds` (rendered timeline rows), `start`, `end`, `startMs`, `endMs`. Load events for just those resources. |

## Slots

All slots are available on `<Scheduler>` and on each view. Specific event slots win over `event`;
`event-content` only replaces the inside of the default event chip.

| Slot | Props |
| --- | --- |
| `toolbar`, `toolbar-start`, `toolbar-center`, `toolbar-end`, `title`, `view-switcher` | `title`, `view`, `views`, `prev()`, `next()`, `today()`, `setView(name)` |
| `nav-prev` / `nav-next` / `today-button` | `prev()` / `next()` / `today()`, `label` |
| `view-button` | `view`, `setView(name)` |
| `event`, `event-content`, `time-event`, `all-day-event`, `month-event`, `agenda-event`, `timeline-event`, `drag-preview` | `occurrence`, `event`, `title`, `timeText`, `view`, `variant`, `allDay`, `isStart`, `isEnd`, `isPast`, `color`, `resourceId`, `isMirror`, `valid` |
| `resize-handle` | `edge`, `variant` |
| `selection` | `view`, `start`, `end`, `allDay`, `resourceId` |
| `day-header` | `date`, `view`, `isToday`, `weekday`, `dayNumber` |
| `all-day-label` | `label` |
| `time-label` | `minute`, `label` |
| `time-slot` | `view`, `date`, `start`, `end`, `isToday`, `resourceId` |
| `month-weekday` | `weekday`, `label` |
| `month-cell`, `month-day-number` | `view`, `date`, `dayNumber`, `isToday`, `isOtherMonth`, `isPast` |
| `more-link` | `date`, `count`, `occurrences`, `label` |
| `more-popover` | `date`, `title`, `occurrences`, `close()` |
| `now-indicator` | `now`, `label` |
| `agenda-day-header` | `view`, `date`, `label`, `isToday`, `count` |
| `agenda-empty` | `view`, `label` |
| `resource-label` | `view`, `resource`, `title`, `depth`, `expanded`, `hasChildren`, `toggle()` |
| `resource-area-header` | `view`, `label` |
| `timeline-header` | `view`, `date`, `minute` (`undefined` for the day heading), `label`, `isToday` |
| `year-day` | `view`, `date`, `dayNumber`, `isToday`, `count`, `occurrences`, `level` (0-4) |
| `year-month-header` | `view`, `date`, `label` |

Availability slots, each with `view`, `date`, `resourceId`, `title`, `color`, `occurrence`: `closed-time`, `blocked-time`, `background-event`. `hidden-events` marks events outside the visible hours, with `view`, `date`, `direction`, `count`, `occurrences`, `label`.

`day-end-time` can go past midnight, up to 24 hours after `day-start-time`: `day-start-time="18:00" day-end-time="30:00"` runs each column until 06:00 the next morning, in time grids. `refusal(kind, occurrence, times)` on `context.interaction` runs every rule for your own checks.

## Passthrough (`pt`)

Every element of the scheduler has a part name, in the attribute `data-orb-part`. Use `pt` to give a part classes, styles, attributes or listeners without replacing it, and slots to replace its content.

```vue
<script setup lang="ts">
import type { SchedulerPt } from 'orb-scheduler'

// Define it outside the template: a new object on every render re-renders every part.
const pt: SchedulerPt = {
  todayButton: { class: 'my-button' },
  monthCell: ({ isToday }) => (isToday ? { class: 'my-today' } : undefined),
  event: ({ occurrence }) => ({ 'data-id': occurrence.id }),
}
</script>

<template>
  <Scheduler :events="events" :pt="pt">...</Scheduler>
</template>
```

To see every part and slot on a live scheduler, what connects to what, and what each receives, run the playground and open the slots and parts page (`#/parts`).

## Theming

Set CSS custom properties on `.orb-scheduler` (or any ancestor). `theme="dark"` / `"auto"` swap
the color set; per-event colors come from the event's `color`. Each event's fill and text are mixed from its
own color (or its resource's); the `*-strength` variables set how much. To replace the mix, set
`--orb-event-bg`, `--orb-event-bg-hover` or `--orb-event-text` on `.orb-event`.

| Group | Variables |
| --- | --- |
| Typography | `--orb-font-family`, `--orb-font-size`, `--orb-font-size-sm`, `--orb-font-size-title`, `--orb-font-weight-strong` |
| Colors | `--orb-color-bg`, `--orb-color-surface`, `--orb-color-text`, `--orb-color-text-muted`, `--orb-color-border`, `--orb-color-border-subtle`, `--orb-color-accent`, `--orb-color-accent-contrast`, `--orb-color-hover`, `--orb-color-today`, `--orb-color-weekend`, `--orb-color-other-month`, `--orb-color-now`, `--orb-color-focus`, `--orb-shadow-popover` |
| Events | `--orb-event-color` (default for events without a color), `--orb-event-bg-strength`, `--orb-event-bg-hover-strength`, `--orb-event-past-bg-strength`, `--orb-event-text-strength`, `--orb-event-text-base`, `--orb-event-border-width`, `--orb-event-radius`, `--orb-event-padding`, `--orb-event-font-size`, `--orb-event-gap`, `--orb-event-min-height`, `--orb-event-past-opacity` |
| Sizes | `--orb-radius`, `--orb-toolbar-gap`, `--orb-control-height`, `--orb-gutter-width`, `--orb-slot-height`, `--orb-day-header-height`, `--orb-allday-event-height`, `--orb-allday-min-height`, `--orb-month-header-height`, `--orb-month-daynum-height`, `--orb-month-event-height`, `--orb-month-event-gap`, `--orb-month-week-min-height`, `--orb-now-width` |
| Resources and timeline | `--orb-tg-column-min-width`, `--orb-tl-resource-width`, `--orb-tl-day-heading-height`, `--orb-tl-slot-heading-height` |
| Year | `--orb-year-month-min-width` |
| Interaction | `--orb-selection-bg`, `--orb-selection-border`, `--orb-mirror-shadow`, `--orb-invalid-color`, `--orb-resizer-size` |

Compact layouts react to the scheduler's own width through container queries (container name
`orb-scheduler`), so you can add your own `@container orb-scheduler (max-width: ...)` rules.

## Editing helpers

```ts
import { applyEventEdit, removeEventOccurrence, useHistory } from 'orb-scheduler'

const events = shallowRef<SchedulerEvent[]>(initial)
const history = useHistory(events, { keyboard: true, limit: 100 })

function onDrop(p: EventChangedPayload<SchedulerEvent>) {
  history.commit(applyEventEdit(events.value, p.occurrence, p, { scope: p.scope, timeZone }), 'Move')
}
function onDelete(p: EventDeletePayload<SchedulerEvent>) {
  history.commit(removeEventOccurrence(events.value, p.occurrence, { scope: p.scope, timeZone }), 'Delete')
}
```

- `applyEventEdit(events, occurrence, times, { scope, timeZone, createId? })` returns a new array
  (unchanged events keep their identity). For recurring events: `this` adds an exception,
  `following` splits the series, `all` shifts the series. An already edited occurrence follows the
  same rules: `this` changes the exception, the others change its series. Resource changes are
  written too.
- `removeEventOccurrence(events, occurrence, { scope, timeZone })`: `this` adds an exdate,
  `following` ends the series, `all` removes the series and its exceptions.
- `useHistory(ref, { keyboard?, limit? })` returns `commit(next, label?)`, `undo()`, `redo()`,
  `reset(present?)`, and the computed `canUndo`, `canRedo`, `undoLabel`, `redoLabel`. With
  `keyboard: true`, Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z or Ctrl+Y redoes (not while typing).
  `createHistory(initial)` is the framework-free version in `orb-scheduler/core`.

Both edit helpers work on the default `SchedulerEvent` shape; with your own shape, follow the same
logic with your fields.

## Dragging in from outside

Any element can become a source of new events, e.g. a list of unplanned jobs next to the
scheduler. It works in every view and with several schedulers on the page.

```vue
<script setup lang="ts">
import { vOrbDraggable, type EventReceivePayload, type ExternalEventTemplate } from 'orb-scheduler'

const jobs: ExternalEventTemplate[] = [
  { title: 'Inspection', color: '#0891b2', duration: 90, data: { jobId: 17 } },
  { title: 'Holiday', allDay: true, days: 3 },
]

function onReceive(p: EventReceivePayload) {
  events.value = [...events.value, {
    id: crypto.randomUUID(),
    title: p.template.title,
    start: p.allDay ? p.start.toPlainDate().toString() : p.start.toString(),
    end: p.allDay ? p.end.toPlainDate().toString() : p.end.toString(),
    resourceId: p.resourceId,
  }]
}
</script>

<template>
  <ul>
    <li v-for="job in jobs" :key="job.title" v-orb-draggable="job">{{ job.title }}</li>
  </ul>
  <Scheduler :events="events" @event-receive="onReceive">...</Scheduler>
</template>
```

Where it lands:

| Dropped on | Result |
| --- | --- |
| A time grid (day, week, resource columns) | Timed, at the snapped drop time, for `duration` minutes (default `default-event-duration`). |
| A day (month cell, all-day row, a timeline with day columns) | All-day for `days` days, or with `allDay: false` timed at `startTime` (default 09:00). |
| A timeline with hour columns | Timed at the drop time, unless `allDay: true`. |
| A resource column or timeline row | Also `resourceId` / `resourceIds` of that resource. |

Template fields (all optional): `title`, `color`, `event` (an object in your own event shape,
used to draw the preview with your accessors and slots; without it the preview uses
`{ title, color }`), `data` (anything you need back), `allDay`, `duration`, `days`,
`startTime`.

- The scheduler under the pointer shows the event where it would land, like a normal drag; spots
  refused by `can-receive` show it in red and the drop does nothing.
- Outside the schedulers a small chip with the title follows the pointer (`.orb-drag-ghost`).
- Escape cancels. On touch, a long press starts the drag, so the source list still scrolls.
- `before-event-receive` can be cancelled or delayed with `waitUntil`, like the other
  before-events.
- For full control, call `startExternalDrag(pointerEvent, template, { longPressDelay?, ghost? })`
  from your own `pointerdown` handler instead of using the directive. Bind `null` to the
  directive to disable a source.
- Not supported: native HTML5 drag and drop (e.g. files or items from other windows) and starting
  this drag from the keyboard.

## Headless use

`useScheduler(options, { date, view }, { emit, slots })` creates the state and provides it to
descendants; `useSchedulerView(() => definition)` registers a view. Layout composables give you
everything a view needs without markup:

| Composable | Gives you |
| --- | --- |
| `useTimeGrid(ctx, config)` | columns (days × resources), time slots, positioned timed events, the all-day row, drag preview and selection overlays, the now line |
| `useMonthGrid(ctx, config)` | weeks, cells, event rows with "+N more", events per day |
| `useTimeline(ctx, config)` | time axis, day and slot headings, rows with laned events, overlays, the now position |
| `useYearGrid(ctx, config)` | months, day cells with occurrences and a 0-4 level |
| `useToolbar(ctx)` | toolbar state and actions |
| `useHistory(ref, options)` | undo/redo |

`orb-scheduler/core` has no Vue dependency: `EventStore` (indexing, range queries, recurrence
expansion), RRULE parsing/expansion/editing (`parseRRule`, `expandSeries`, `truncateRuleBefore`),
date helpers, range strategies (`dayStrategy`, `weekStrategy`, `monthStrategy`, `yearStrategy`),
layout (`columnsLayout`, `stackLayout`, `packLanes`, `layoutDayGridRow`, `createTimelineAxis`,
`layoutTimelineRow`), resource trees (`buildResourceTree`, `visibleResources`), the interaction
math (`computeMove`, `computeResize`, `computeSelection`), the edit helpers and `createHistory`.

## Performance

- Events are normalized once; changing one object in a 10 000-event array re-reads only that
  object. Treat event objects as immutable.
- Recurring series are expanded only for the visible range, with stable occurrence objects.
- Agenda and timeline render only the visible rows.
- Parent re-renders do not re-render events: options that are equal by value (inline arrays such
  as `:hidden-days="[6, 7]"`) keep their identity, and slots only signal a change when slots are
  added or removed.
- Navigating mounts the events of the new range once. In the playground's production build,
  a week view with 10 000 events (about 560 in the visible week) navigates in roughly 100–150 ms
  on a desktop CPU; a typical week of a few dozen events takes a few milliseconds.
- `npm run playground:build` and `npm run playground:preview` build and serve the playground in
  production mode for measuring.
