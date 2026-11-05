# Custom views

A view is any component inside `<Scheduler>` that registers itself. The view switcher, navigation, keyboard shortcuts, `v-model:view` and `range-change` then work with it like with the built-in ones. The scheduler only asks what the view shows; the view draws it however it likes.

## The smallest view

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useSchedulerContext, useSchedulerView, weekStrategy } from 'schedvueler'

const props = withDefaults(defineProps<{ name?: string }>(), { name: 'cards' })

const ctx = useSchedulerContext()

const { isActive } = useSchedulerView(() => ({
  name: props.name,
  label: 'Cards',
  // What is visible for a date, and where previous and next go.
  strategy: weekStrategy({ weekStart: ctx.options.value.weekStart }),
  // The toolbar title.
  title: (range) => `Cards from ${range.start}`,
  // Optional: minWidth, maxWidth.
}))

const cards = computed(() => ctx.occurrences.value)
</script>

<template>
  <ul v-if="isActive">
    <li v-for="occ in cards" :key="occ.key">{{ ctx.accessors.value.title(occ.event) }}</li>
  </ul>
</template>
```

```vue
<Scheduler :events="events">
  <WeekView />
  <CardsView />
</Scheduler>
```

Render nothing while `isActive` is false; only one view shows at a time.

## What you get from the context

`useSchedulerContext()` gives everything the built-in views use:

| Field | What it is |
|---|---|
| `occurrences` | Occurrences in the visible range, sorted, with optimistic changes applied |
| `backgroundOccurrences` | Events with `display: 'background'` |
| `range`, `window`, `date`, `today`, `now` | The visible range as dates and milliseconds, the anchor date and the time |
| `options` | Resolved options; `options.value.raw` has them as given |
| `accessors` | Reads fields of your event shape |
| `resources`, `visibleResources` | The resource tree |
| `availability` | `shadesFor`, `hoursFor`, `isClosedDay` |
| `interaction` | Drag, resize and selection |
| `part(name, scope)` | `data-orb-part` and `pt` attributes for an element |
| `emit(name, payload)` | Emits from `<Scheduler>` |
| `goTo`, `prev`, `next`, `setView`, `openDate` | Navigation |

## Strategies

Use `dayStrategy`, `weekStrategy`, `monthStrategy` or `yearStrategy`, or write one: an object with `range(anchor)`, returning `{ start, end, active }`, and `step(anchor, direction)`.

## Drawing events

`useTimeGrid`, `useMonthGrid`, `useTimeline` and `useYearGrid` do the layout without any markup. In core, `segmentByDay`, `spanRow`, `layoutDayGridRow`, `createTimelineAxis` and `layoutTimelineRow` are the same logic without Vue.

## Dragging

Tell the scheduler what is under the pointer, and dragging, resizing and selecting work, with every rule applied:

```ts
const off = ctx.interaction.registerSurface({
  hitTest(x, y) {
    // Return null when not over this view.
    return { zone: 'month', date: dateAt(x, y) }
  },
  scrollElement: () => scroller.value,
})
onBeforeUnmount(off)
```

Then call `ctx.interaction.pointerDownOnSlot(e, name)` on empty space, and `pointerDownOnEvent(e, occurrence, 'move', name)` on events. `Hit` has four zones: `time`, `all-day`, `month` and `timeline`. `YearPlanner.vue` in this repository is a complete, short example.

## Slots

`useSlotResolver(slots, ctx)` looks a slot up on the view and then on the scheduler, so your view takes the same slots as the others.
