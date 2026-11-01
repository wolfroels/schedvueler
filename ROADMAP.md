# Roadmap to a feature-complete Vue scheduler

Written 2026-10-31 from the [full review in RESEARCH.md](RESEARCH.md#4-full-review-2026-10-31). Phases 1–6 in RESEARCH.md are done; this continues from there. Bug details are under [Known bugs](RESEARCH.md#known-bugs).

**Priority:** P0 needed before any release, P1 expected of a serious scheduler, P2 competitive, P3 later.
**Effort:** S up to a day, M a few days, L a week or more.

**Goal:** the free, Vue-native scheduler with what others charge for (resource timeline, drag and drop, recurrence), which stays headless-friendly, typed and fast at 10 000+ events.

**Customization rules for every new feature:**
- Every new element gets a slot where someone could want other content, a `pt` part name and `data-orb-part`, and CSS variables for its colors and sizes.
- Add it to `playground/anatomy.ts` so it appears on the [slots and parts page](playground/PartsPage.vue).
- Behavior lives in core or a headless composable first; the component is a default on top. Nothing is only reachable through the built-in UI.

**Order:** phases 7 and 8 come first, because new features should land on correct edits and a browser test suite. Phases 9 to 14 can overlap once those are done.

## Phase 7: Fix the known bugs

All done. Also fixed along the way: a slot added later with `v-if` left the old elements in place (found by the slots and parts page), and dragging an event out of the month popover landed it on the wrong day (found by the browser tests).

| Done | ID | Item | Priority | Effort |
|---|---|---|---|---|
| [x] | B1 | Undo of a recurring "this" edit: clear optimistic changes when an exception for that occurrence appears | P0 | S |
| [x] | B2 | Duplicate occurrences after a zone change: store floating recurrence ids and exdates for floating series | P0 | M |
| [x] | B3 | Honor scope when editing an exception, and report it as part of a series in the payload | P0 | M |
| [x] | B4 | Releasing a moved event outside the scheduler cancels the drag | P0 | S |
| [x] | B5 | Always `preventDefault` Alt+arrows on events, and announce refused moves | P0 | S |
| [x] | B6 | Keep focus on the event after a keyboard move or view change | P0 | M |
| [x] | B8 | `DayView` inherits `hidden-days`; a hidden anchor moves to the next visible day; N-day views count visible days | P1 | S |
| [x] | B9 | Auto-scroll zones start below the sticky header and beside the resource column | P1 | S |
| [x] | B10 | Delete works on every event variant that the keyboard can edit | P1 | S |
| [x] | B11 | Popover: draggable styling, closes when a drag starts, list updates after changes | P1 | S |
| [x] | B12 | `allDay` with a date-time end includes that day | P1 | S |
| [x] | B13 | Warn on duplicate ids and on ids that collide as strings | P1 | S |
| [x] | B14 | Validate props: warn in dev, fall back instead of throwing | P1 | M |
| [x] | B15 | Keep edited events floating when they were floating (wall-clock output) | P1 | S |
| [x] | B16 | Keep views in declaration order when one is toggled with `v-if` | P2 | M |
| [x] | B17 | Remember the preferred day of the month while navigating | P2 | S |
| [x] | B18 | Reject SECONDLY with a warning; warn at the expansion limit; allow `X-` rule parts | P2 | S |
| [x] | B19 | Fix the playground hint (views past the ninth use the switcher; custom shortcuts are item 15.20) | P3 | S |
| [x] | B20 | Cancel active gestures on unmount | P3 | S |

B7 (RTL) is fixed for drag, keyboard and layout; the remaining work is item 13.4.

## Phase 8: Release foundation

| Done | ID | Item | Priority | Effort |
|---|---|---|---|---|
| [x] | 8.1 | Browser tests with Playwright in Chromium, Firefox and WebKit (`e2e/`): drag, resize, select, keyboard and rendering across the views. Touch runs in Chromium only and covers the week view | P0 | L |
| [ ] | 8.10 | Touch tests beyond Chromium's week view: other views, swipe navigation, Firefox and WebKit on real devices | P1 | M |
| [ ] | 8.2 | Component tests for slots, emits and props; visual regression for each view in light and dark | P1 | M |
| [x] | 8.3 | CI: lint, types, unit, browser, build, bundle-size budget | P0 | S |
| [x] | 8.4 | Package: `LICENSE`, version, changelog, `publint`, size budget. `private` stays on until you choose to publish; removing it is the only release step left | P0 | S |
| [ ] | 8.5 | Verify SSR hydration in Nuxt: stable ids, no time or locale mismatch, no `window` at import | P1 | M |
| [ ] | 8.6 | Docs site with live examples, migration notes and recipes (editor dialog, lazy loading, server sync) | P1 | L |
| [ ] | 8.7 | Stabilize the public API: mark internals, freeze names before 1.0 | P1 | M |
| [x] | 8.9 | Passthrough: `pt` prop and `data-orb-part` on every element, plus the slots and parts page | P1 | M |
| [x] | 8.8 | Fill the promised API gaps: anchor `element` / rect on `select`, `event-drop` and `event-delete`; `before-event-delete`; `scrollToTime()`, `scrollToEvent()`, `getEvents()` | P1 | M |

## Phase 9: Availability and rules

The biggest functional gap for real planning use.

| Done | ID | Item | Priority | Effort |
|---|---|---|---|---|
| [x] | 9.1 | `business-hours` per weekday, shaded in every view | P1 | M |
| [x] | 9.2 | Business hours and availability per resource | P1 | M |
| [x] | 9.3 | Blocked time: `is-slot-disabled` and declarative ranges, refusing select, drop and receive | P1 | M |
| [x] | 9.4 | `min-date` / `max-date`: limit navigation and edits | P1 | S |
| [x] | 9.5 | Background events (holidays, closures) with their own layer and slot | P1 | M |
| [x] | 9.6 | Per-event `editable`, `draggable`, `resizable`, `class` and `textColor` fields | P1 | S |
| [x] | 9.7 | `event-overlap` rule (allow, forbid, or a function), with an `event-change-failed` emit | P1 | M |
| [x] | 9.8 | Duration rules: min and max length, per event type | P2 | S |
| [x] | 9.9 | `slot-attrs` for classes and attributes on cells, matching `event-attrs` | P2 | S |
| [x] | 9.10 | Indicators for events outside the visible hours | P2 | S |
| [x] | 9.11 | Overnight days (`day-end-time` past 24:00, for example `30:00`) | P2 | L |

## Phase 10: Editing power

The "no built-in editor" decision stays: these are behaviors and helpers, not dialogs.

| Done | ID | Item | Priority | Effort |
|---|---|---|---|---|
| [x] | 10.1 | `v-model:selected-events`, Ctrl/Shift click, marquee select | P1 | M |
| [x] | 10.2 | Move, resize and delete several events at once, as one undo step | P1 | L |
| [x] | 10.3 | Copy, cut, paste with the keyboard; Ctrl+drag to duplicate | P1 | M |
| [x] | 10.4 | Keyboard: resize the start edge, N to create, Tab order between toolbar, grid and events | P1 | S |
| [x] | 10.5 | `event-leave`: drag events out, including to another scheduler | P2 | M |
| [x] | 10.6 | Native HTML5 drops (files, other windows); start an outside drag from the keyboard | P2 | M |
| [x] | 10.7 | Keep the original length when an event goes timed → all-day → timed | P3 | S |
| [x] | 10.8 | Helpers: `edit-events` for custom event shapes through accessors | P2 | M |
| [x] | 10.9 | Headless `useEventPopover` / anchor positioning helper, and a recipe for tooltips | P2 | M |

## Phase 11: Views

| Done | ID | Item | Priority | Effort |
|---|---|---|---|---|
| [x] | 11.1 | Document and test the custom view API, with one example view | P1 | M |
| [x] | 11.2 | Multi-month view; N-week day grid (`<MonthView :weeks="2">`) | P2 | M |
| [x] | 11.3 | Week numbers in month, week and year views | P2 | S |
| [x] | 11.4 | Multiple time zones in the time-grid gutter | P2 | M |
| [x] | 11.5 | Year view as a linear planner with event bars | P3 | M |
| [x] | 11.6 | Toolbar: overflow menu for many views, date picker on the title, `empty` and `loading` slots | P2 | M |
| [x] | 11.7 | Day and N-day views that follow a work-week definition | P3 | S |
| [x] | 11.8 | Responsive presets: change the view set by breakpoint with one prop | P3 | S |

## Phase 12: Timeline and resources

This is the free, differentiating feature, so it should be the strongest part.

| Done | ID | Item | Priority | Effort |
|---|---|---|---|---|
| [x] | 12.1 | Virtualize the time axis and events. Today's baseline is 17 780 DOM nodes and 350–460 ms per navigation in timeline month at 20 000 events | P1 | L |
| [x] | 12.2 | Readable timed events in day columns: compact bars, stacking, or a count per day | P1 | M |
| [x] | 12.3 | Multi-tier headers (month / week / day / hour) with zoom levels | P1 | L |
| [x] | 12.4 | Resource search, sort and filter | P1 | M |
| [x] | 12.5 | Several resource columns with a `resource-column` slot, and resizable resource area | P1 | M |
| [x] | 12.6 | Group totals and per-resource load or capacity rows | P2 | M |
| [x] | 12.7 | Drag rows to reorder resources | P2 | M |
| [x] | 12.8 | Lazy-loaded resource trees and `resource-expand` loading | P2 | M |
| [x] | 12.9 | Events split across several resources: drag one, or all of them | P2 | M |
| [x] | 12.10 | Dependencies between events (arrows, finish-to-start) | P3 | L |
| [x] | 12.11 | Gantt-style view with progress and milestones | P3 | L |

## Phase 13: Accessibility, global use, performance

| Done | ID | Item | Priority | Effort |
|---|---|---|---|---|
| [ ] | 13.1 | Grid semantics: `role=grid`, rows and cells, slot names with date and time | P1 | M |
| [ ] | 13.2 | WCAG 2.2 AA audit with axe and screen readers; contrast checks for event colors; `forced-colors` | P1 | M |
| [ ] | 13.3 | Pointer alternative for every drag (WCAG 2.5.7), such as a move/resize mode | P1 | M |
| [ ] | 13.4 | RTL: check a real RTL locale and calendar text, and add browser tests (hit testing and logical CSS are done) | P1 | S |
| [ ] | 13.5 | Translated `messages` packs, plus the toolbar and recurrence wording | P2 | M |
| [ ] | 13.6 | Non-Gregorian calendars through Temporal | P3 | L |
| [ ] | 13.7 | Test on real iOS and Android; tune long-press, handles and scroll conflicts | P1 | M |
| [ ] | 13.8 | Performance budgets in CI; cut week navigation at 20 000 events (140–160 ms in the dev build); run recurrence expansion in a worker if needed | P2 | M |
| [ ] | 13.9 | Pluggable `month-event-order` and memoized layouts per day and resource | P3 | M |

## Phase 14: Data and output

| Done | ID | Item | Priority | Effort |
|---|---|---|---|---|
| [ ] | 14.1 | `useEventSource`: fetch by range and visible resources, cache ranges, cancel stale requests, `refetch()` | P1 | M |
| [x] | 14.2 | `loading` and `error` states with slots | P1 | S |
| [ ] | 14.3 | iCalendar import and export, including VTIMEZONE and exceptions | P1 | L |
| [ ] | 14.4 | RRULE to readable text, localized | P2 | M |
| [ ] | 14.5 | Headless recurrence form helper (rule ↔ form state) | P2 | M |
| [ ] | 14.6 | Print stylesheet and print-friendly layouts | P2 | M |
| [ ] | 14.7 | Export to CSV and JSON; PDF and image through a documented recipe | P3 | M |
| [ ] | 14.8 | Change tracking: a list of created, updated and deleted events for batch saves | P2 | M |
| [ ] | 14.9 | Sync recipes for Google Calendar, Microsoft Graph and CalDAV | P3 | M |
| [ ] | 14.10 | Plugin API (`{ name, install(ctx) }`), as sketched in RESEARCH.md | P3 | L |
| [ ] | 14.11 | Real-time updates: incoming changes during a drag, and showing who is editing | P3 | L |

## Phase 15: Standout features

Things that would make people pick this scheduler over the others. Each follows the customization rules above.

| Done | ID | Item | Slots and parts | Priority | Effort |
|---|---|---|---|---|---|
| [ ] | 15.1 | `useAvailability`: find free time across resources for a given length (`findSlots`, `nextFree`) | Headless; `suggestion` slot to show results in the grid | P1 | M |
| [ ] | 15.2 | Conflict radar: mark overlapping events and list them, per resource | `conflict-badge` slot, `conflict` part, `useConflicts` | P1 | M |
| [ ] | 15.3 | Live drag tooltip with the time, length and conflicts | `drag-tooltip` slot, `dragTooltip` part | P1 | S |
| [ ] | 15.4 | Draft mode: try changes as tentative events, compare, then apply or discard them all | `draft-bar` slot, `useDraft` | P2 | L |
| [ ] | 15.5 | Mini calendar navigator that shows busy days and the visible range | `<SchedulerMiniCalendar>` with its own slots | P1 | M |
| [ ] | 15.6 | Calendars as layers: toggle sets of events, with a legend | `legend` and `legend-item` slots, `useCalendars` | P1 | M |
| [ ] | 15.7 | Filter and search that dims or hides events without changing the data | `event-filter` prop, `orb-event--dimmed` | P1 | S |
| [ ] | 15.8 | Buffer time: setup and cleanup blocks attached to an event, which move with it | `event-buffer` slot, `eventBuffer` part | P2 | M |
| [ ] | 15.9 | Timeline zoom with Ctrl + scroll and pinch, keeping the point under the pointer | `zoom-control` slot | P2 | M |
| [ ] | 15.10 | Timeline minimap showing the whole range and busy areas | `minimap` slot and part | P3 | M |
| [ ] | 15.11 | Utilization heatmap over timeline rows and day cells | `utilization` slot and part | P2 | M |
| [ ] | 15.12 | Sticky event titles: long bars keep their title in view while scrolling | `--orb-event-sticky-title` | P2 | S |
| [ ] | 15.13 | Event stacks: collapse many overlapping events into one expandable group | `event-stack` slot, `eventStack` part | P2 | M |
| [ ] | 15.14 | Time scale compression: empty hours shrink so busy hours get the room | `time-fold` slot, `timeFold` part | P3 | M |
| [ ] | 15.15 | Animated moves between positions, dates and views, off with reduced motion | `--orb-transition-*` | P2 | M |
| [ ] | 15.16 | Density and theme presets; a whole theme generated from one color | `density` prop, `createTheme(color)` | P2 | S |
| [ ] | 15.17 | Undo toast after a change | `undo-toast` slot, works with `useHistory` | P2 | S |
| [ ] | 15.18 | Quick add from text ("Lunch friday 12:30 for 1h"), with a pluggable parser | Headless `parseQuickAdd`; `quick-add` slot | P3 | M |
| [ ] | 15.19 | Command palette actions: go to date, switch view, find an event | Headless `useCommands` | P3 | S |
| [ ] | 15.20 | Custom keyboard map, including view shortcuts | `keymap` prop | P2 | S |
| [ ] | 15.21 | Recurrence edit dialog logic: which scope to ask, and what each answer changes | Headless `useRecurrenceScope`, recipe with slots | P1 | S |
| [ ] | 15.22 | Happening now: live progress on running events and a countdown to the next | `event-progress` slot, `--orb-event-progress` | P3 | S |
| [ ] | 15.23 | World clock overlap: mark hours that suit several time zones | `time-zone-band` slot and part | P3 | M |
| [ ] | 15.24 | Presence: show who is viewing or dragging what | `presence` slot and part | P3 | M |
| [ ] | 15.25 | Theme and `pt` playground that exports the code you built on the slots and parts page | Playground only | P3 | M |

## Definition of feature complete (1.0)

All of the following:
- No open P0 or P1 bugs.
- Every P0 and P1 item above is done.
- Browser tests pass in Chromium, Firefox and WebKit, and on real iOS and Android.
- A WCAG 2.2 AA audit has passed.
- Timeline month with 20 000 events navigates in under 100 ms in a production build.
- The docs site covers every prop, emit and slot, with a live example per view.

## Open decisions

These are the defaults this roadmap assumes. Change them here if you decide otherwise.

| Topic | Assumed default |
|---|---|
| License | MIT, with no paid tier, because free resources and timeline are the main advantage |
| Built-in editor and popups | Stay out of the package, as decided in RESEARCH.md; provide helpers and recipes instead |
| Gantt and dependencies | Late and optional (P3), possibly as a separate plugin |
| Vue and browser support | Vue 3.5+, latest two browser versions, Temporal polyfill kept until Safari ships it |
