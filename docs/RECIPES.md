# Recipes

Short, complete answers to what comes up in most apps. The package stays out of your dialogs and your backend; these show how to connect them.

## An editor dialog

The scheduler has no built-in editor. `select` creates, `event-click` edits, and your dialog owns the form.

```vue
<script setup lang="ts">
const editing = ref<Partial<SchedulerEvent>>()

function onSelect(p: SelectPayload) {
  editing.value = { start: p.start.toString(), end: p.end.toString(), allDay: p.allDay }
}
function save(event: SchedulerEvent) {
  history.commit([...events.value.filter((e) => e.id !== event.id), event], 'Save event')
  editing.value = undefined
  scheduler.value?.clearSelection()
}
</script>

<template>
  <Scheduler
    ref="scheduler"
    :events="events"
    selectable
    @select="onSelect"
    @event-click="(p) => (editing = p.event)"
  />
  <MyDialog v-if="editing" :event="editing" @save="save" @cancel="editing = undefined" />
</template>
```

Use `recurrenceToForm` and `formToRecurrence` for the repeat fields, and `recurrenceToText` to show the result in words.

## Asking which occurrences to change

```vue
<script setup lang="ts">
const scope = useRecurrenceScope()
</script>

<template>
  <Scheduler
    @before-event-drop="scope.confirm"
    @before-event-resize="scope.confirm"
    @event-drop="(p) => commit(applyEventEdit(events, p.occurrence, p, { scope: p.scope, timeZone }))"
  />
  <dialog v-if="scope.request.value" open>
    <button
      v-for="option in scope.options.value"
      :key="option.scope"
      @click="scope.answer(option.scope)"
    >
      {{ option.label }}
    </button>
    <button @click="scope.answer(null)">Cancel</button>
  </dialog>
</template>
```

## Loading events by range

```ts
const source = useEventSource({
  fetch: ({ start, end, signal }) =>
    fetch(`/api/events?from=${start}&to=${end}`, { signal }).then((r) => r.json()),
})
```

```vue
<Scheduler
  :events="source.events.value"
  :loading="source.loading.value"
  :error="source.error.value"
  @range-change="source.onRangeChange"
/>
```

Ranges that were loaded are not asked for again; a new request cancels the running one. `source.refetch()` starts over. With `byResource: true` and `@visible-resources-change="source.onVisibleResources"`, it also loads only the rows in view.

## Saving to a server

The scheduler shows a change right away and keeps it until `events` changes. Call `revert()` when saving fails:

```ts
async function onDrop(p: EventChangedPayload<SchedulerEvent>) {
  try {
    await api.update(p.event.id, { start: p.start.toString(), end: p.end.toString() })
    events.value = applyEventEdit(events.value, p.occurrence, p, { scope: p.scope, timeZone })
  } catch {
    p.revert()
  }
}
```

To save in one batch instead:

```ts
const tracking = useChangeTracking(events)

async function save() {
  await api.batch(tracking.changes.value)
  tracking.markSaved()
}
```

## Changes from other people

Assign the new array; only changed objects are read again. A gesture on an event that was deleted ends by itself. Pass `presence` to show who is looking at what:

```ts
socket.on('events', (list) => (events.value = list))
socket.on('presence', (list) => (presence.value = list))
```

## Tooltips

```vue
<script setup lang="ts">
const tip = useEventPopover<SchedulerEvent>({ placement: 'top' })
</script>

<template>
  <Scheduler
    @event-mouseenter="(p) => tip.open(p.element, p.event)"
    @event-mouseleave="tip.close"
  />
  <div v-if="tip.isOpen.value" :ref="tip.setElement" :style="tip.style.value" role="tooltip">
    {{ tip.data.value?.title }}
  </div>
</template>
```

## Import and export

```ts
const { events, warnings } = parseICal(await file.text())
const ics = stringifyICal(events.value)
const csv = occurrencesToCsv(
  scheduler.value.getEvents(),
  defaultCsvColumns((e) => e.title),
)
const json = occurrencesToJson(scheduler.value.getEvents())
```

## PDF and images

`scheduler.value.print()` opens the print dialog with print styles, where "Save as PDF" gives a file. For an image or a PDF on the server, render the page with a headless browser (Playwright: `page.pdf()` or `page.screenshot()`). In the browser, `html-to-image` works on the scheduler's root element; keep the view small enough to fit, because it only sees what is rendered.

## Google Calendar

```ts
const source = useEventSource({
  async fetch({ startMs, endMs, signal }) {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('timeMin', new Date(startMs).toISOString())
    url.searchParams.set('timeMax', new Date(endMs).toISOString())
    url.searchParams.set('singleEvents', 'true')
    const res = await fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } })
    const { items } = await res.json()
    return items.map((e) => ({
      id: e.id,
      title: e.summary,
      start: e.start.dateTime ?? e.start.date,
      end: e.end.dateTime ?? e.end.date,
    }))
  },
})
```

`singleEvents` makes Google expand series. To keep series, leave it out and read `recurrence` into `rrule`.

## Microsoft Graph

Use `GET /me/calendarView?startDateTime=…&endDateTime=…`. Graph expands series there. Map `subject` to `title`, `isAllDay` to `allDay`, and `start.dateTime` with `start.timeZone` to `start` and `timezone`. Ask for IANA names with the header `Prefer: outlook.timezone="Europe/Brussels"`.

## CalDAV

Run a `calendar-query` REPORT on the server side with a `time-range` for the range, and hand the `calendar-data` of each result to `parseICal`. Write with `PUT` and `stringifyICal`, using the `ETag` in `If-Match` so that you do not overwrite someone else's change. Browsers usually cannot reach CalDAV servers directly, because of CORS.

## Plugins

```ts
const analytics: SchedulerPlugin = {
  name: 'analytics',
  install(ctx) {
    const stop = watch(ctx.activeViewName, (view) => track('view', view))
    return stop
  },
}
```

```vue
<Scheduler :plugins="[analytics]" />
```

`install` gets the whole context; what it returns is called when the scheduler goes away.
