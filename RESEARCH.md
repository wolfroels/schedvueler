# Scheduler research: what others do, what we should build

Research date: 2026-10-29. I looked at:
- **JS/React:** FullCalendar v7, Schedule-X, Toast UI, react-big-calendar, Bryntum, DHTMLX, Mobiscroll, Syncfusion, DayPilot.
- **Blazor:** Radzen, Heron.MudCalendar, Syncfusion, Telerik, DevExpress, Blazorise.
- **Vue:** vue-cal, Qalendar, Schedule-X/vue, FullCalendar/vue3, Vuetify VCalendar, Quasar QCalendar, vue-simple-calendar.

Some docs pages didn't load, so a few API names come from memory. Check those before relying on them.

---

## 1. Landscape at a glance

| Library | License | Views | Resource / timeline | Virtualization | Customization model | Notable |
|---|---|---|---|---|---|---|
| FullCalendar v7 | MIT core, **paid** resources | day/week/month/list/multiMonth, custom `duration` | paid | opt-in `virtualization` (v7) | 4 hooks per UI part: `*Class/*Content/*DidMount/*WillUnmount` | `revert()` on changes; Temporal-based since v7 |
| Schedule-X | MIT core, **paid** DnD/resize/resources | day/week/month grid/agenda/year | paid | none documented | slots + plugins | Preact+signals core; async `onBeforeEventUpdate` |
| react-big-calendar | MIT | month/week/day/agenda + resources | basic | **none** (1000 events ≈ 3–5 s) | `components` map + `*PropGetter` | pluggable overlap layout algorithm |
| Bryntum | commercial | 12 views | yes, tree resources | rows + time axis + DOM recycling | renderer functions, `features` map | async veto `context.async/finalize()`; undo/redo |
| DHTMLX | GPL/commercial | many via extensions | yes | `smart_rendering` | global string templates | dated singleton API |
| Mobiscroll | commercial | compose `{calendar,scheduler,timeline,agenda}` × `{type,size}` | yes | `virtualScroll` + `onVirtualLoading` | ~40 renderers, `*Event` vs `*EventContent` | `*Failed` events after validation |
| Syncfusion | commercial | day…year, agenda, timeline* | yes, multi-level | virtual resources (30 default) + lazy load per visible resource | per-view templates | one `actionBegin` cancel pipeline for all actions |
| DayPilot | commercial | calendar/month/scheduler/gantt | yes | progressive render, viewport + buffer | `onBeforeXRender` hooks | 100k events / 1000 rows ≈ 1.9 s |
| Radzen (Blazor) | MIT | day/week/month/year/multi-day/agenda/planner | grouping | none | **child view components** | tiny view contract; `SlotRender`/`AppointmentRender` attr hooks |
| MudCalendar (Blazor) | MIT | fixed enum | no | none | per-view templates | predicate props: `CanDragItem`, `IsDateTimeDisabledFunc` |
| Telerik (Blazor) | commercial | day/week/multi-day/month/timeline/agenda | yes | none | item/slot/all-day templates | click events **don't re-render** by default |
| DevExpress (Blazor) | commercial | day(n)/week/workweek/month/timeline | yes | none | horizontal vs vertical event templates | `-ing` (cancellable) / `-ed` event pairs; permission flags |
| vue-cal | MIT | years/year/month/week/day | split columns only | none | slots | v5 is still prerelease, waiting on timezone support; HTML5 DnD, so no touch |
| QCalendar (Quasar) | MIT | day/week/month/agenda/resource/scheduler/task | grid only | none | slots | grid only: no event layout engine, tied to Quasar |
| Vuetify VCalendar | MIT | month/week/day/category/custom | category only | none | slots | no DnD |

### The gap in the Vue ecosystem
1. **No free, Vue-native resource timeline with virtualization.** FullCalendar and Schedule-X charge for it. QCalendar and Vuetify only give you a grid.
2. **Wrappers don't feel like Vue.** FullCalendar takes one big options object and its callbacks aren't real emits. Schedule-X is a non-reactive Preact instance.
3. **Touch drag and drop is weak or paid.** Libraries built on HTML5 DnD don't work on touch, and Schedule-X's DnD is premium.
4. **No typed API.** No library offers generic event types, `defineSlots` or `defineEmits` contracts.
5. **No headless, composable-first scheduler exists**, i.e. nothing comparable to Reka UI or TanStack.

---

## 2. Patterns that converged across libraries

### Views
- **Views as child components that register with a parent.** Radzen, Syncfusion, Telerik, DevExpress and Blazorise all do this. It maps directly to Vue `provide`/`inject`:
  ```vue
  <Scheduler v-model:date="date" v-model:view="view" :events="events">
    <SchedulerToolbar />
    <DayView />
    <WeekView :start-hour="7" :end-hour="19" />
    <DayView name="4days" :days="4" label="4 Days" />
    <MonthView :max-events-per-cell="3" />
    <TimelineView :resources="rooms" :slot-duration="30" />
    <AgendaView v-if="isMobile" />
  </Scheduler>
  ```
- **The view contract is tiny.** Radzen and react-big-calendar use roughly `{ name, label, range(anchor), next(anchor), prev(anchor), title(range), component }`. Anyone can write a custom view against it.
- **A few base layouts cover everything:** time grid (day/week/N-day/resource columns), day grid (month/N-week/year), timeline (resource rows × time), and list (agenda). "4 days" or "2 weeks" is just configuration, as in Syncfusion's `interval` or FullCalendar's `duration`.
- **Responsive view switching.** Schedule-X `isResponsive` and Mobiscroll breakpoints swap the view set on small screens.

### Customization
- **A named, scoped slot for every UI part.** View-specific slots fall back to generic ones: `month-event` falls back to `event`.
- **Two slot variants:** one replaces the whole element, the other only its inner content (Mobiscroll `renderXEvent` / `renderXEventContent`).
- **Rich slot props:** `isMirror` (drag ghost), `isStart/isEnd` (an event split across days), `isPast/isToday`, `isNarrow/isShort`, `resource`, `view`.
- **Class/attr getters that don't replace the DOM.** react-big-calendar has `eventPropGetter`, Radzen `AppointmentRender`, Telerik `OnCellRender`. They must be **pure functions**: Radzen's version loops forever if you trigger a re-render inside it.
- **Predicate props for hot paths** (MudCalendar, Blazorise): `canDrag(event)`, `canDrop(event, slot)`, `isSlotDisabled(slot)`. These are cheaper than emits because they run synchronously during render.

### Event / emit conventions
Libraries let you cancel a change in three different ways, and the best ones support all three:
1. **Before-events with cancel:** DevExpress `-ing`/`-ed` pairs, DHTMLX `onBefore*`, Syncfusion `actionBegin`.
2. **Optimistic update plus `revert()`:** FullCalendar.
3. **Fully controlled:** the host applies the change itself (react-big-calendar, Toast UI).

Some also let you cancel **asynchronously**, for example to confirm a dialog or check the server first: Bryntum `finalize()`, DayPilot `args.async`, Schedule-X `onBeforeEventUpdateAsync`, DevExpress cancelling inside `-ing` after an API call.

Mobiscroll adds a **failure event**: `onEventUpdateFailed` fires when an overlap or invalid-range rule rejects a change.

### Data and refresh
- **One lazy-load hook with the visible range.** The equivalents are FullCalendar `datesSet`, Radzen `LoadData`, MudCalendar `DateRangeChanged` and Schedule-X `fetchEvents`. Syncfusion and Mobiscroll also pass the **visible resource ids** when the timeline is virtualized.
- **Cache loaded ranges** (FullCalendar `lazyFetching`), plus `refetch()`.
- **Incremental updates rather than a full re-render.** FullCalendar v6 had a regression where every event re-rendered on any state change; v7 fixed it. Bryntum CrudManager syncs only changed records.
- **Recurrence:** RFC 5545 RRULE + EXDATE + exceptions, **expanded only for the visible range**. Editing asks "this / following / all". Schedule-X's partial RRULE support is a lesson in what not to ship.
- **Timezones:** use an explicit display timezone plus optional per-event zones. Never default to the environment's timezone: Syncfusion's server-vs-WASM default difference confuses users. The ecosystem is moving to **Temporal** (FullCalendar v7 and Schedule-X v3 both use `temporal-polyfill`). Safari still has no native Temporal.

### Performance
- **The cost is visible elements × slot render cost, not dataset size.** One Bryntum user loads 30k events lazily without trouble but slows down at about 300 *visible* heavy custom bars.
- **Virtualize** timeline resource rows, and the time axis too where possible (Bryntum, DHTMLX, Syncfusion, Mobiscroll, FullCalendar v7).
- **Cap** events per month cell and show "+N more".
- **Make overlap layout a pure function**, memoized per day or resource bucket, and make it pluggable (react-big-calendar `dayLayoutAlgorithm`). Use absolute positioning so the browser never re-lays out sibling events.
- **Don't re-render on click or hover** (Telerik `ShouldRender=false`).
- Every vendor gets complaints at a few hundred events, with deep resource trees, or in year timelines.

### Accessibility and mobile
- **Grid semantics:** `role=grid` cells with arrow-key navigation, `role=button` events, `aria-current="date"`, ARIA labels on navigation.
- **Keyboard shortcuts** (Syncfusion and DevExpress):
  - arrows move between cells, Shift+arrow extends the selection
  - Ctrl+arrow goes to the previous or next period, Alt+1..6 switches views
  - Enter edits, Delete deletes, Esc cancels, N creates a new event
- **Focus zones:** toolbar, grid, events.
- **Touch:** long-press to start a drag, with `touch-action: none` only on the handles. Use ResizeObserver for sizing.

---

## 3. Proposed architecture for our Vue scheduler

### Layers
1. **`core`:** pure TypeScript with no Vue. It holds the date adapter, range math, recurrence expansion, overlap layout, the event index (by day and resource), and the drag/resize state machine. It is testable and could run in a worker.
2. **Composables (headless):** `useScheduler()`, `useView()`, `useEventDrag()`, `useSelection()`, `useVirtualRows()`, `useKeyboardNav()`. They return refs plus prop-getters. This is the layer for people who want full control.
3. **Components:** `<Scheduler>`, `<XxxView>` children, `<SchedulerToolbar>`, and primitives (`<TimeGrid>`, `<DayGrid>`, `<Timeline>`, `<EventItem>`, `<NowIndicator>`). They are styled with CSS variables and unstyled mode is optional.

### Vue specifics
- `<script setup lang="ts" generic="TEvent extends SchedulerEvent, TResource extends SchedulerResource">` lets the user's event type flow into slots and emits.
- `defineSlots` and `defineEmits` give typed slot props and payload tuples.
- `defineModel` provides `v-model:date`, `v-model:view`, `v-model:selected` and optionally `v-model:events` for controlled mode.
- `provide`/`inject` uses a typed `InjectionKey`, and views register on mount and unregister on unmount.
- **Reactivity:**
  - Keep events in a `shallowRef`, normalized into `Map<id, event>` plus per-day/per-resource buckets.
  - Each cell or row gets its own computed over its bucket.
  - Wrap layout results and date objects in `markRaw`.
  - Use `v-memo` on event chips.
  - Render plain elements and only create a component when the user supplies a slot.
- **Virtualization:** `@tanstack/vue-virtual` (headless). It handles resource rows in the timeline, the time axis for long timelines, and the agenda list.
- **Drag and drop:** use **pointer events**, not HTML5 DnD.
  - Capture the pointer, throttle moves with rAF, snap to slots, and drive the ghost with `transform`.
  - Auto-scroll near edges, cancel with Esc, and offer keyboard move and resize.
  - Add an optional HTML5 adapter for dropping external items onto the scheduler.
- **Dates:** put a `DateAdapter` interface in core with a Temporal implementation by default (via `temporal-polyfill`). Store events as epoch ms or ISO strings internally for cheap sorting.
- **Vue 3.6 Vapor mode** is still RC, so treat it as a bonus rather than a requirement.

### Emits (initial list)
- **Navigation:** `update:date`, `update:view`, `range-change` `{start, end, view, resources}`, `navigate` (before, cancellable)
- **Selection:** `slot-click`, `slot-dblclick`, `slot-contextmenu`, `range-select` (drag-select), `selecting` (cancellable)
- **Events:** `event-click`, `event-dblclick`, `event-contextmenu`, `event-mouseenter`, `event-mouseleave`, `event-keydown`
- **Drag:** `event-drag-start`, `event-drag` (throttled), `before-event-drop` (cancellable/async), `event-drop` (has `revert()`), `event-drag-cancel`
- **Resize:** `event-resize-start`, `before-event-resize`, `event-resize`, `event-resize-cancel`
- **CRUD:** `before-event-create`, `event-create`, `before-event-update`, `event-update`, `before-event-delete`, `event-delete`, `event-change-failed`
- **External:** `external-drop`, `event-leave` (dragged out)
- **Overflow and popups:** `more-click` (cancellable), `popover-open`, `popover-close`, `editor-open` (cancellable), `editor-close`
- **Lifecycle:** `loading`, `ready`, `view-mounted`, `view-unmounted`, `events-rendered`
- **Resources:** `resource-click`, `resource-expand`, `resource-collapse`, `visible-resources-change` (virtualization)

Every cancellable payload is `{ ..., preventDefault(), waitUntil(promise) }`.

### Slots (initial list)
- **Toolbar:** `toolbar`, `toolbar-left`, `toolbar-center`, `toolbar-right`, `title`, `nav-prev`, `nav-next`, `today-button`, `view-switcher`
- **Headers and gutters:** `day-header`, `all-day-header`, `time-label`, `resource-header`, `resource-group-header`, `timeline-header` (per tier), `week-number`
- **Cells:** `slot`, `all-day-slot`, `month-cell`, `month-cell-header`, `timeline-cell`
- **Events:** `event` / `event-content`, plus per-view `day-event`, `month-event`, `timeline-event`, `agenda-event`, `all-day-event`
- **Overlays:** `now-indicator`, `drag-ghost`, `selection`, `business-hours`, `more-link`, `more-popover`
- **Popups:** `tooltip`, `quick-popover` (header/body/footer), `editor` (header/body/footer)
- **States:** `empty`, `loading`, `agenda-empty`

### Props / settings (sketch)
- **Global:** `events`, `resources`, `field mapping` (accessors), `timezone`, `locale`, `weekStart`, `hour12`, `slotDuration`, `snapDuration`, `startHour`/`endHour`, `businessHours`, `editable` (or granular `allowCreate/Drag/Resize/Delete/DragBetweenResources`), `readonly`, `messages` (i18n)
- **Hooks:** `eventAttrs(e)`, `slotAttrs(s)`, `canDrag`, `canDrop`, `canResize`, `isSlotDisabled`, `layoutAlgorithm`
- **Per view:** each view takes overrides of the global settings plus its own (`days`, `maxEventsPerCell`, `headerTiers`, `virtual`, `rowHeight`…)
- **Plugins:** `{ name, install(ctx) }` with access to stores; plugins can register views, slots, interactions and overlays.

### Decisions (2026-10-29)
| Topic | Decision |
|---|---|
| Layering | Pure-TS **core**, then **headless composables**, then **components** |
| Styling | **Plain CSS**, no Tailwind. Ships a default theme. All colors come from CSS custom properties, and so do the main sizes: event height/padding/radius, slot height, header heights, gutter width, row height, font sizes |
| Recurrence and time zones | **Full support in v1**: RRULE + EXDATE + exceptions, "this/following/all" edits, display timezone + per-event zones |
| RRULE implementation | **Our own RFC 5545 expander** in core, built on the DateAdapter, which expands only the visible range |
| Dates | **Temporal** via `temporal-polyfill`, behind a `DateAdapter` interface |
| Popups / editor | **Slots and emits only.** No built-in editor, tooltip or popover; we expose the anchor element/rect in emit payloads so consumers can position their own. The "+N more" overflow list stays built in, since it is layout and not an editor |
| Audience | **Publishable npm package**: Vite library mode, `.d.ts`, stable public API |
| Testing / demo | **Vitest** unit tests for core (date math, layout, RRULE, DST) + **playground** Vite app with a large generated dataset |



### Phasing (updated for the decisions)
1. **Core.** Temporal DateAdapter, timezone-aware range math, RRULE expander, event index, overlap layout. Vitest coverage including DST transitions.
2. **Root + first views.** `<Scheduler>` root, view registry, CSS-variable theme, TimeGrid (day/week/N-day) and MonthView with typed slots and emits, plus the playground app.
3. **Interaction.** Pointer drag/resize/select with before/after events, recurring-event edit scope (this/following/all) in the payloads, keyboard navigation and ARIA.
4. **Agenda and mobile.** AgendaView, responsive view switching, and touch long-press.
5. **Resources and timeline.** TimelineView with resource rows, virtualization, lazy load by visible resources, and resource columns in the time grid.
6. **Polish.** Year view, undo/redo helpers, perf pass with 10k+ events, docs.
7. **Known Bugs** The user will place known bugs under the Known bugs section. This will, the AI will write bugs it finds and so will the user here. This section will continue as long as there are bugs


---

## 4. Full review (2026-10-31)

Reviewed at commit `154f919`. The plan that comes out of this review is in [ROADMAP.md](ROADMAP.md).

### How it was tested
- **Automated checks:** `vitest` (230 tests pass), `vue-tsc`, `eslint` and the library build are all clean.
- **By hand in the playground (Chromium, 1400×900 and the 390 px phone frame):** every view, driven with scripted pointer and keyboard events, checking the emit log and the DOM after each step.
- **Throwaway probes of core:** RRULE edge cases, DST, bad input, edit helpers, server rendering and bad props.
- **Code reading:** interaction, edit helpers, event store, view registration, time grid, month grid, timeline.

**Not covered:**
- Real touch devices and Safari or Firefox. Touch was simulated with touch-type pointer events.
- Hydration in a real SSR app. Only `renderToString` was run.
- Timings are from the dev build, so treat them as relative. Frame-based timing was unusable because the test pane throttled animation frames.
- The competitor comparison uses section 1 of this file and general knowledge. It was not re-checked online.

### Verdict
The core is strong: the architecture is clean, the RRULE engine held up well, row virtualization works and the typed API is good. The gaps are edit correctness at the edges (recurring events with undo or time zones), keyboard and accessibility polish, no component or browser tests, and scheduling features that a feature-complete product needs, starting with business hours and blocked time.

### What works

| Area | Tested | Result |
|---|---|---|
| Week, work week, N-day | Render, navigate, today, PageUp/PageDown, T, Alt+digit | OK |
| Move | Same day, other day, opposite time directions, timed ↔ all-day | OK |
| Resize | Start and end edges, shrink past the other edge stops at one snap | OK |
| Cancel | Escape during a drag, `event-drag-cancel` | OK |
| After a drag | The click that follows is swallowed | OK |
| Selection | Drag to create in week, month and timeline; double-click to create | OK |
| Month | Move, all-day resize, "+N more" popover, compact dots with tap-to-list | OK |
| Year | Heatmap, day drill-down, month title opens the month | OK |
| Agenda | Rows, keyboard move | OK |
| Timeline | Move across rows, resize, select, collapse groups | OK |
| Virtualization | 600 resources: 22 to 29 rows in the DOM, about 440 nodes | OK |
| Resource columns | Grouped by resource and by date (rendering only) | OK |
| Recurrence edits | this / following / all, weekday shift, exdates moving along, undo of following and all | OK |
| RRULE | BYSETPOS (in playground data), BYWEEKNO, BYYEARDAY, BYHOUR/BYMINUTE, WKST + INTERVAL, 31st of the month, Feb 29, impossible rules do not hang, year 2100 in 1 ms | OK |
| DST | Spring gap moves 02:30 to 03:30; autumn repeat uses the first 02:30 | OK |
| Invalid events | Bad dates, RRULEs and zones are skipped and the rest still shows | OK |
| Dragging in from outside | Time grid, month, `startTime`, releasing outside does nothing | OK |
| Locale, slots, theme | en-US week start and 12-hour clock, 15-minute slots, dark theme, custom event slot | OK |
| Responsive | `min-width` hides views at phone width, compact month | OK |
| Touch (simulated) | Swipe navigation, long-press drag | OK |
| Server rendering | `renderToString` produces events and columns | OK |

**Fixed since this review:** all bugs in the review (B1 to B20), including the failures this table mentioned.

**Earlier known bugs:** the low-opacity event text and the jumping during drags were re-checked and stay fixed. While dragging in month view no other event moved, the all-day row kept its height, and past events have opacity 1. They are removed from the list below.

### Bugs
The review found 20 bugs (B1 to B20). They are fixed; see phase 7 in [ROADMAP.md](ROADMAP.md).

### Weak spots that are not bugs
- **Tests:** all 8 test files cover core (the 16 runs are those files against native Temporal and the polyfill). There are no component or browser tests, which is why several of the review's bugs got through. Drag behavior, focus and rendering have no safety net.
- **Performance at the high end:** only rows are virtualized, not time or events. With 20 000 events:

  | View | DOM nodes | Events rendered | Next period (dev build) |
  |---|---|---|---|
  | Timeline month | 17 780 | 3 527 | 350–460 ms |
  | Week | not measured | 1 142 | 140–160 ms |
  | Month | 267 | 31 | 19–57 ms |
  | Year | 956 | 0 | about 18 ms |

- **Timeline month readability:** timed events in day-wide columns shrink to small chips that show one or two clipped characters. They need a compact rendering (dots, a count, or stacked bars with titles).
- **Accessibility:**
  - No `role=grid`.
  - Time slots between labels are unnamed buttons, and the named ones only say "09:00" with no date.
  - Resize handles are pointer-only, and the keyboard cannot move an event's start edge.
  - No `forced-colors` styles.
- **RTL and print:** drag, keyboard and layout now work right to left, but only tested with `dir="rtl"` on English text, not a real RTL locale. No print styles.
- **Events with hidden hours:** events entirely outside `day-start-time` / `day-end-time` are left out with no hint.
- **API gaps against the decisions in section 3:**
  - `select`, `event-drop` and `event-delete` have no anchor element or rect, though the popups decision promised one.
  - `event-delete` cannot be cancelled and has no `before-event-delete`.
  - No `scrollToTime()` or `scrollToEvent()` on the template ref.
  - No `loading` state or `empty` slot.
  - The planned `businessHours` and `isSlotDisabled` were never built.
- **Packaging:** `private: true`, version `0.0.0`, no `LICENSE`, no `CHANGELOG`, no CI, no docs site.

### Features missing for "feature complete"
Compared with FullCalendar Premium, Bryntum, Mobiscroll, Syncfusion and DHTMLX. Everything is itemized in [ROADMAP.md](ROADMAP.md).

| Group | Missing |
|---|---|
| Availability | Business hours, blocked or disabled time, min/max date, background events, per-resource hours |
| Editing | Copy/paste, duplicate by drag, multi-select and group drag, per-event `editable`, overlap prevention and conflict events, resize of the start edge from the keyboard |
| Views | Multi-month, N-week grids, week numbers, multi-tier timeline headers, documented custom views |
| Timeline | Time and event virtualization, resource search, sort and filter, resource columns, resizable resource area, capacity, dependencies |
| Data | Lazy-load helper with range cache, loading and error states, iCal import/export, RRULE to text, recurrence form helper |
| Output | Print, PDF and image export, CSV |
| Global | RTL, translations, full WCAG 2.2 AA pass |

# Known bugs

None open. Add new ones here, and remove them once fixed.

**Correction to the 2026-10-31 review:** B18 said lowercase RRULEs are rejected. They are accepted; that probe failed because it also contained an unknown part (`foo=bar`). Unknown parts are still rejected, except `X-` extensions, and the event is skipped with a warning. `FREQ=SECONDLY` is unsupported in the same way.
