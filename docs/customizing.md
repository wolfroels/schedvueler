# Customizing

There are three levels, and each works on every element:

- **CSS variables** change colors and sizes.
- **Passthrough** (`pt`) adds classes, styles, attributes and listeners to any part, without replacing it.
- **Slots** replace content.

The playground's slots and parts page (`npm run dev`, then `#/parts`) shows on a live scheduler what each part and slot is called and what connects to what.

## Themes

```css
.schedvueler {
  --orb-color-accent: #0f766e;
  --orb-slot-height: 3rem;
}
```

`createTheme(color)` gives the variables of a whole theme from one color, and `density` sets how much room everything takes.

Choose a built-in visual preset independently from the light/dark color mode:

```vue
<Scheduler theme="auto" preset="glass" :events="events">
  <WeekView />
</Scheduler>
```

Available presets are `default`, `modern`, `glassmorphism`, `neumorphic`, `clean`, `bento`,
`neo-brutalism`, and `cyber-y2k`. The older `glass` value remains an alias for `glassmorphism`.
The default keeps the original appearance. Presets are opt-in, work with `theme="light"`,
`"dark"`, or `"auto"`, and still accept explicit `--orb-*` overrides.

Presets keep the reading surface (`--orb-color-bg`: grid cells, headers, popovers, and the base
event fills are mixed into) near white or a neutral dark, and put their tint in the frame around
it, `--orb-color-canvas` (the toolbar area and root background). `--orb-color-canvas` defaults to
`--orb-color-bg`, so the default appearance is unchanged; set it to tint the frame without
muddying event colors.

<SchedulerDemo view="week" :height="440" :options="{ density: 'compact', style: { '--orb-color-accent': '#0f766e' } }" />

### PrimeUIX token bridge

To inherit an existing PrimeUIX styled-mode preset, import both stylesheets:

```ts
import 'schedvueler/style.css'
import 'schedvueler/primeuix.css'
```

The bridge is optional and has no runtime dependency. It maps the standard `--p-*` variables
onto the scheduler's visual tokens; missing values retain the original light/dark defaults.
The [setup tutorial](/guide#use-primeuix-styling-instead-of-the-default-palette) includes preset
configuration and dark-mode guidance.

| Scheduler token                                   | PrimeUIX token                 |
| ------------------------------------------------- | ------------------------------ |
| `--orb-color-bg`                                  | `--p-content-background`       |
| `--orb-color-surface`, `--orb-color-hover`        | `--p-content-hover-background` |
| `--orb-color-text`                                | `--p-text-color`               |
| `--orb-color-text-muted`                          | `--p-text-muted-color`         |
| `--orb-color-border`, `--orb-color-border-subtle` | `--p-content-border-color`     |
| `--orb-color-accent`                              | `--p-primary-color`            |
| `--orb-color-accent-contrast`                     | `--p-primary-contrast-color`   |
| `--orb-color-focus`                               | `--p-focus-ring-color`         |
| `--orb-radius`, `--orb-event-radius`              | `--p-content-border-radius`    |
| `--orb-shadow-popover`                            | `--p-overlay-popover-shadow`   |

Weekend, closed-time, and blocked-time shading are derived from `--p-text-color`. Event colors
and the current-time indicator remain scheduler-specific. You can still override public
`--orb-*` variables on `.schedvueler` or through the scheduler's `style` prop. Removing only
the bridge import restores the default palette.

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
import { nl } from 'schedvueler/locales'
```

```vue
<Scheduler locale="nl-BE" :messages="nl.messages" />
```

Dates and weekday names follow `locale`; `messages` holds the rest of the wording. `nl`, `fr`, `de` and `es` are included, and any field can be overridden.
