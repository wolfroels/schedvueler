# AI implementation guide

Use this guide when adding orb-scheduler to an existing Vue 3 application. It is an integration
workflow, not a substitute for the [API reference](/api) or the app's own architecture.

## Instructions for coding assistants

When asked to implement a scheduler feature:

1. Inspect the existing app first. Identify its framework, package manager, routing, styling
   system, event model, persistence layer, tests, and current UI conventions. Reuse these instead
   of scaffolding a second app or introducing a competing state store.
2. Clarify only decisions that block a correct implementation: which events to show, the display
   time zone, required views, whether people may create or edit events, and which resources are
   meaningful. Use sensible defaults when the repository or request already answers these.
3. Use the installed `orb-scheduler` package and its public exports. Do not copy the scheduler's
   internal layout or interaction logic into the application.
4. Keep event data and persistence in the application. Treat scheduler props as input and emits as
   requests to update that application-owned data.
5. Make the smallest change that fits the existing screen. Preserve unrelated work and avoid
   changing library internals, public APIs, or application-wide design without a requirement.
6. Verify the result with the narrowest relevant typecheck, test, or build. For UI work, also check
   the rendered page, navigation, empty/loading/error states as applicable, and a narrow viewport.
   Report checks that could not be run.

## Integration recipe

### 1. Install and import

Use the repository's package manager to add `orb-scheduler`. Import the public stylesheet once in
the app entry point or owning page:

```ts
import 'orb-scheduler/style.css'
```

Do not install another calendar library unless the user specifically asks for one.

### 2. Map the app's data

Prefer the built-in `SchedulerEvent` fields when they match the domain. If the app already has a
stable event shape, preserve it and provide `accessors` for `id`, `title`, `start`, `end`, and any
other required fields. Do the same for resources with `resource-accessors`.

Use these date rules when mapping records:

- Date-only values represent all-day events by default.
- All-day end dates are exclusive.
- Date-times without an offset are wall-clock times in the event's `timezone`, then
  `event-time-zone`, then `time-zone`.
- Values with `Z` or a numeric offset represent exact instants.
- Choose an IANA display time zone deliberately; do not silently parse local server timestamps as
  browser-local times.
- Replace changed event objects or arrays. Do not mutate event fields in place and expect them to
  be re-read.

### 3. Compose the scheduler

Give the parent a definite height. Declare only the views the feature needs, and bind `view` or
`date` when the surrounding app needs to control them.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Scheduler, WeekView, MonthView, type SchedulerEvent } from 'orb-scheduler'

const view = ref('week')
const events = ref<SchedulerEvent[]>([])
</script>

<template>
  <div class="scheduler-region">
    <Scheduler v-model:view="view" :events="events" time-zone="Europe/Brussels">
      <WeekView />
      <MonthView />
    </Scheduler>
  </div>
</template>

<style scoped>
.scheduler-region {
  min-height: 360px;
  height: 70vh;
}
</style>
```

For narrow layouts, use view `min-width` / `max-width` and verify the fallback is useful. Avoid
duplicating the scheduler's own date navigation or view switcher unless the design calls for a
custom toolbar; the `toolbar` and related slots are public extension points.

### 4. Wire requested interactions

Enable only the interactions the feature requires. For drag/resize, update app state with
`applyEventEdit` rather than rebuilding recurrence and resource behavior yourself:

```ts
import { applyEventEdit, type EventChangedPayload, type SchedulerEvent } from 'orb-scheduler'

const timeZone = 'Europe/Brussels'

function onChange(p: EventChangedPayload<SchedulerEvent>) {
  events.value = applyEventEdit(events.value, p.occurrence, p, {
    scope: p.scope,
    timeZone,
  })
}
```

If persistence is asynchronous, call `p.revert()` when saving fails. Use `selectable` and
`@select` only when event creation is in scope; the application owns the editor and validation.
Handle `event-delete` explicitly if deletion is requested. For recurring edits, preserve and
respect `p.scope` (`this`, `following`, or `all`).

### 5. Connect loading and resources

For range-based data, use `range-change` or `useEventSource`; pass through cancellation signals,
loading state, and errors. For large resource timelines, use `visible-resources-change` when the
backend can fetch only visible rows. Do not add a second fetch loop that ignores the scheduler's
requested range.

Give resources stable IDs and titles; use `parentId` for groups. Attach each event to a resource
with `resourceId` or `resourceIds`. Select `TimelineView` for time across columns and resources
down rows; select `GanttView` for task rows and dependencies. See [Views](/views) and
[Recipes](/recipes) for examples.

### 6. Customize through public APIs

- Use named slots to replace content and `pt` to decorate parts.
- Use documented `--orb-*` CSS variables for theme and sizing.
- Do not target undocumented `.orb-*` class names; their names and markup may change.
- Preserve the app's established visual language and responsive behavior.
- Keep controls keyboard-operable and avoid removing the built-in toolbar without providing
  equivalent navigation.

## Verification checklist

- The selected time zone and event date semantics are explicit.
- The parent has a usable height at desktop and mobile widths.
- Empty, loading, and error states are handled when data is asynchronous.
- Drag, resize, create, and delete are enabled only when implemented end to end.
- Successful edits update app-owned event data; failed saves restore the prior event position.
- Resource assignments and recurrence scope survive edits where those features are used.
- The relevant typecheck/build and focused tests pass; UI changes are checked in a browser.
- The final report names changed files, behavior, checks run, and any remaining gaps.

## Source of truth

Use the repository's installed types and [API reference](/api) for exact props, emits, and slots.
Use [Recipes](/recipes) for persistence and loading patterns, [Customizing](/customizing) for
slots and styling, and [API stability](/api-stability) to distinguish supported extension points
from internals.
