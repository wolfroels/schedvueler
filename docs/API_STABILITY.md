# API stability

Until 1.0, a minor version can change anything; the [changelog](https://github.com/wolfroels/schedvueler/blob/main/CHANGELOG.md) lists it. From 1.0 on, the following follows semver.

## Public

- `<Scheduler>`: its props, emits, slots, models and exposed methods.
- The view components: `DayView`, `WeekView`, `MonthView`, `MultiMonthView`, `YearView`, `AgendaView`, `TimelineView`, `GanttView`.
- `SchedulerToolbar`, `SchedulerMiniCalendar`, `SchedulerLegend`, `SchedulerUndoToast`, `SchedulerQuickAdd`.
- `SchedulerPart` names and `data-orb-part`, and CSS variables named `--orb-*` in the docs.
- Composables whose name starts with `use`, and `vOrbDraggable`, `startExternalDrag`.
- Everything in `schedvueler/core` and `schedvueler/locales`, except what is marked below.

## For building your own views

These are public, and may get new fields in a minor version, so read what you need rather than copying them whole:

- `useSchedulerContext` and `SchedulerContext`.
- `TimeGrid`, `MonthGrid`, `Timeline`, `AgendaList`, `EventItem` and `RenderSlot`: the parts the built-in views are made of. Their props can change more easily than those of the views.

## Not public

- `orb-*` class names can change in a minor version. Style with `data-orb-part`, `pt` or CSS variables.
- Fields and functions marked `@internal` in the types.
- The markup inside a part, including how many elements it has.
