# Customizing

There are three levels, and each works on every element:

- **CSS variables** change colors and sizes.
- **Passthrough** (`pt`) adds classes, styles, attributes and listeners to any part, without replacing it.
- **Slots** replace content.

The playground's slots and parts page (`npm run dev`, then `#/parts`) shows on a live scheduler what each part and slot is called and what connects to what.

## Themes

```css
.orb-scheduler {
  --orb-color-accent: #0f766e;
  --orb-slot-height: 3rem;
}
```

`createTheme(color)` gives the variables of a whole theme from one color, and `density` sets how much room everything takes.

<SchedulerDemo view="week" :height="440" :options="{ density: 'compact', style: { '--orb-color-accent': '#0f766e' } }" />

## Passthrough

```vue
<script setup lang="ts">
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

Define it outside the template: a new object on every render re-renders every part.

Every part carries `data-orb-part`, which you can also use from CSS:

```css
[data-orb-part='dayHeader'] {
  text-transform: uppercase;
}
```

## Slots

```vue
<Scheduler :events="events">
  <template #event-content="{ title, timeText, event }">
    <strong>{{ title }}</strong>
    <small>{{ timeText }} · {{ event.room }}</small>
  </template>
  <WeekView />
</Scheduler>
```

Slots on a view win over those on the scheduler, and view-specific event slots (`time-event`, `month-event`, ...) win over `event`. `event-content` keeps the event's box and only replaces what is inside. The full list is in the [API](/api#slots).

## Translations

```ts
import { nl } from 'orb-scheduler/locales'
```

```vue
<Scheduler locale="nl-BE" :messages="nl.messages" />
```

Dates and weekday names follow `locale`; `messages` holds the rest of the wording. `nl`, `fr`, `de` and `es` are included, and any field can be overridden.
