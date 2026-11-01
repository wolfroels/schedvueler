# Getting started

```sh
npm install orb-scheduler
```

The scheduler fills the height of its parent, so give that a height.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Scheduler, WeekView, MonthView, applyEventEdit, type SchedulerEvent } from 'orb-scheduler'
import 'orb-scheduler/style.css'

const timeZone = 'Europe/Brussels'
const events = ref<SchedulerEvent[]>([
  { id: 1, title: 'Lunch', start: '2026-06-15T12:00', end: '2026-06-15T13:00' },
])

function onChange(p) {
  events.value = applyEventEdit(events.value, p.occurrence, p, { scope: p.scope, timeZone })
}
</script>

<template>
  <div style="height: 600px">
    <Scheduler
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

Views are components inside `<Scheduler>`; the first one opens, and the toolbar switches between them. Your events stay yours: the scheduler emits what changed, and you update your data.

<SchedulerDemo view="week" :height="480" />

Drag events, drag their edges, and drag over empty space. Alt and the arrow keys do the same from the keyboard, and Ctrl+Z undoes it.

## Events

```ts
{
  id: 1,
  title: 'Standup',
  start: '2026-06-15T09:00',  // wall-clock time
  end: '2026-06-15T09:15',    // exclusive
  rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  resourceId: 'crew-a',
  color: '#2563eb',
}
```

- `2026-06-15` is a date, and all-day unless `allDay: false`. For all-day events `end` is the day after the last day.
- `2026-06-15T09:00` has no offset, and is read in the event's `timezone`, or else in `event-time-zone` or the display zone.
- `2026-06-15T09:00Z` and `2026-06-15T09:00+02:00` are exact points in time.

Events of any other shape work through `accessors`.

## What next

- [Views](/views) shows each view, live.
- [Customizing](/customizing) covers slots, passthrough and themes.
- [API](/api) has every prop, emit and slot.
- [Recipes](/recipes) has editor dialogs, loading, saving and calendar sync.
