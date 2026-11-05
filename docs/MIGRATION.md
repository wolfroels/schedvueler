# Migrating

## From FullCalendar

The biggest difference: your data stays yours. FullCalendar changes its copy of an event and tells you; here the scheduler shows the change and emits it, and you update your array. `applyEventEdit` does that for the default event shape.

| FullCalendar | schedvueler |
|---|---|
| `initialView`, `views` | View components inside `<Scheduler>` |
| `headerToolbar` | The `toolbar`, `toolbar-start`, `toolbar-center` and `toolbar-end` slots |
| `eventContent` | The `event` and `event-content` slots |
| `eventClassNames`, `eventDidMount` | `event-attrs`, or `pt.event` |
| `eventDrop`, `eventResize` | `event-drop`, `event-resize` |
| `eventAllow`, `selectAllow` | `can-drop`, `can-select` |
| `eventOverlap`, `selectOverlap` | `event-overlap` |
| `businessHours`, `eventConstraint` | `business-hours`, `business-hours-only` |
| `validRange` | `min-date`, `max-date` |
| `display: 'background'` | `display: 'background'` |
| `editable`, `selectable` | `editable`, `selectable` |
| `slotMinTime`, `slotMaxTime` | `day-start-time`, `day-end-time` |
| `slotDuration` (`'00:30'`) | `slot-duration` (minutes) |
| `events` as a function | `useEventSource` |
| `resourceTimelineMonth` | `<TimelineView period="month">` (free) |
| `droppable`, `Draggable` | `v-orb-draggable`, `event-receive` |
| `eventReceive`, `eventLeave` | `event-receive`, `event-leave` |
| `calendar.gotoDate(d)` | `v-model:date`, or `goTo(d)` on the template ref |
| `calendar.scrollToTime(t)` | `scrollToTime(t)` on the template ref |
| `calendar.getEvents()` | `getEvents()` on the template ref |
| `rrule` plugin | Built in: `rrule` on an event |
| `icalendar` plugin | Built in: `parseICal`, `stringifyICal` |

Dates in emits are `Temporal.ZonedDateTime`. `p.start.toString()` gives ISO text; `new Date(p.start.epochMilliseconds)` gives a `Date`.

## From Schedule-X

| Schedule-X | schedvueler |
|---|---|
| `createCalendar({ views })` | View components inside `<Scheduler>` |
| `calendarApp.events.set(list)` | `:events` |
| `callbacks.onEventUpdate` | `event-drop`, `event-resize` |
| Custom components | Slots |
| Scrollbar, drag and resize plugins | Built in |

## From vue-cal

| vue-cal | schedvueler |
|---|---|
| `events` with `start`, `end` | `:events` with `start`, `end`, in ISO text |
| `split-days` | Resources with `<DayView :resources>` |
| `editable-events` | `editable` |
| `time-from`, `time-to` | `day-start-time`, `day-end-time` |
| `#event` | `#event` |
