# Using orb-scheduler

This guide covers the common app workflows: showing events, choosing a view, handling edits,
and connecting your own data. For every prop, event, and slot, see the [API reference](/api).

## Install and render

```sh
npm install orb-scheduler
```

Import the stylesheet and give the scheduler a container with a height. The scheduler fills its
parent; it does not choose the height of the page for you.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  Scheduler,
  WeekView,
  MonthView,
  applyEventEdit,
  type EventChangedPayload,
  type SchedulerEvent,
} from 'orb-scheduler'
import 'orb-scheduler/style.css'

const timeZone = 'Europe/Brussels'
const view = ref('week')
const events = ref<SchedulerEvent[]>([
  { id: 1, title: 'Lunch', start: '2026-06-15T12:00', end: '2026-06-15T13:00' },
])

function onChange(p: EventChangedPayload<SchedulerEvent>) {
  events.value = applyEventEdit(events.value, p.occurrence, p, {
    scope: p.scope,
    timeZone,
  })
}
</script>

<template>
  <div style="height: 600px">
    <Scheduler
      v-model:view="view"
      :events="events"
      :time-zone="timeZone"
      editable
      @event-drop="onChange"
      @event-resize="onChange"
    >
      <WeekView />
      <MonthView />
    </Scheduler>
  </div>
</template>
```

Views are child components. The first is the default; the built-in toolbar lets people switch
between the views. Keep your event data in your app: the scheduler reports changes but does not
save them for you.

<SchedulerDemo view="week" :height="480" />

## Use PrimeUIX styling instead of the default palette

If your app uses a PrimeUIX preset (for example through PrimeVue styled mode), add the optional
bridge stylesheet after the scheduler's base stylesheet:

```ts
import 'orb-scheduler/style.css'
import 'orb-scheduler/primeuix.css'
```

Keep the base stylesheet: it supplies layout, interactions, and fallback styling. The bridge
replaces the mapped visual tokens with your app's PrimeUIX colors, borders, focus color,
border radii, and popover shadow. No scheduler prop or PrimeUIX dependency is required by the
scheduler itself. Without the bridge import, PrimeUIX tokens do not affect the scheduler.

If PrimeVue styled mode is not already configured in your app, install its theme packages:

```sh
npm install primevue @primeuix/themes
```

Then configure a preset in your app entry point:

```ts
import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import App from './App.vue'
import 'orb-scheduler/style.css'
import 'orb-scheduler/primeuix.css'

createApp(App)
  .use(PrimeVue, { theme: { preset: Aura } })
  .mount('#app')
```

The bridge reads the standard `--p-*` CSS variables, so keep PrimeUIX's default `p` prefix and
make sure those variables are available on the scheduler or an ancestor. Installing a preset
alone does not emit CSS variables; your theme integration must load them. Other PrimeUIX
integrations can use the same bridge without PrimeVue.

Preset changes update the scheduler automatically. With PrimeVue's default system-based dark
mode, set `theme="auto"` on the scheduler (its default is `light`). If your app uses a custom
`darkModeSelector`, bind the scheduler to the same app state:

```vue
<Scheduler :theme="darkMode ? 'dark' : 'light'" :events="events">
  <WeekView />
</Scheduler>
```

Your app still applies its dark-mode selector to an ancestor. Keeping `theme` in sync also
updates scheduler-specific event shading and native controls. Missing PrimeUIX tokens fall
back to the scheduler's original light/dark styling. Event-category colors and the current-time
indicator stay independently configurable, and explicit `--orb-*` overrides still take priority.
See [Customizing](/customizing#primeuix-token-bridge) for the token mapping.

## Choose a view

- `DayView` and `WeekView` show time slots and work well for appointments.
- `MonthView` and `YearView` give a broad date overview.
- `AgendaView` lists events in date order.
- `TimelineView` shows time across columns and resources down rows, useful for teams, rooms, or
  equipment.
- `GanttView` shows tasks on rows, with optional progress and dependencies.

Views can be combined in one scheduler. Bind `v-model:view` when your app needs to know which
view is open. Set `min-width` or `max-width` on a view to keep it out of the switcher when the
container is too narrow. See [Views](/views) for live examples and view-specific options.

## Prepare event data

The default event shape is `SchedulerEvent`:

```ts
{
  id: 'standup',
  title: 'Stand-up',
  start: '2026-06-15T09:00',
  end: '2026-06-15T09:15',
  rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  resourceId: 'crew-a',
  color: '#2563eb',
}
```

- A date-only start such as `2026-06-15` is all-day unless `allDay: false`. Its `end` is exclusive:
  an event covering June 15 ends on `2026-06-16`.
- A date-time without an offset, such as `2026-06-15T09:00`, is wall-clock time in the event's
  `timezone`, `event-time-zone`, or scheduler `time-zone`, in that order.
- A date-time with `Z` or an offset identifies an exact moment.
- Set an IANA `time-zone` such as `Europe/Brussels` when displaying or saving wall-clock events;
  this keeps edits predictable across daylight-saving changes.

Events are treated as immutable. Replace the changed event or array when your data changes. For a
different event shape, map your fields with the `accessors` prop instead of converting every
record by hand.

## Save edits

Set `editable` to enable drag and resize. Apply the emitted change to your state with
`applyEventEdit`; it handles moved resources and recurrence edit scope as well as start and end
times.

```ts
async function onChange(p: EventChangedPayload<SchedulerEvent>) {
  try {
    await api.updateEvent(p.event.id, {
      start: p.start.toString(),
      end: p.end.toString(),
      resourceIds: p.resourceIds,
    })
    events.value = applyEventEdit(events.value, p.occurrence, p, {
      scope: p.scope,
      timeZone,
    })
  } catch {
    p.revert()
  }
}
```

The scheduler previews a move immediately and keeps it visible until your event data changes. If
the save fails, call `p.revert()` to restore the previous position. For recurring events, use
`p.scope` (`this`, `following`, or `all`) when applying the change. See [Recipes](/recipes) for
deletion, undo, editing dialogs, and persistence patterns.

To let people create events by selecting empty time, add `selectable` and handle `@select`. The
payload includes the selected start, end, whether it is all-day, and the selected resource (if
any). Your app decides what form to show and when to save the new event.

## Load events from a server

For small datasets, pass the full event list to `:events`. To fetch only what is visible, handle
`range-change` or use `useEventSource`; it provides the requested date range, cancellation, loading
and error state. `visible-resources-change` can further limit timeline loads to visible rows.
See the [loading recipe](/recipes#loading-events-by-range) for a complete example.

## Add resources and a timeline

Resources are rows in `TimelineView` and can also become columns in `DayView` or `WeekView`.
Connect each event to a resource with `resourceId` or `resourceIds`.

```vue
<Scheduler :events="events" :resources="resources">
  <TimelineView period="week" />
</Scheduler>
```

```ts
const resources = [
  { id: 'design', title: 'Design', color: '#2563eb' },
  { id: 'build', title: 'Build', color: '#ea580c' },
]
```

Use `parentId` to group resources. Events without an explicit color inherit the resource color.
See [timeline options](/api#timeline-props) for scale, row, and resource settings.

## Customize and interact

- Use slots to replace content, such as an event label or resource name.
- Use `pt` to add classes, styles, attributes, and listeners to named parts without replacing
  their content.
- Use documented `--orb-*` CSS variables for colors and sizing. Avoid depending on internal
  class names.
- Keep the built-in toolbar when possible; it includes date navigation, Today, and view switching.

Keyboard users can move focus with the arrow keys, select with Shift + arrows and Enter, move an
event with Alt + arrows, resize it with Alt + Shift + arrows, and navigate periods with
PageUp/PageDown or `T`. On touch screens, swipe changes the period and a long press starts a drag.
More details are in the [accessibility section](/api#accessibility).

## Next

- [Views](/views): live examples of each view.
- [Customizing](/customizing): slots, passthrough, and themes.
- [API](/api): all props, emits, and slots.
- [Recipes](/recipes): dialogs, loading, saving, and calendar sync.
- [AI implementation guide](/ai-implementation): a workflow for coding assistants integrating
  the scheduler into an app.
