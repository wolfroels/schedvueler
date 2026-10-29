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


# Known bBugs
1. the opacity of the events is too low and it is not as readable
2. dragging a event over to another day causes it to weirdly behave in the drag vertically

**Fixed** (after phase 6):
- 1: past events were faded with opacity 0.65, text included. They now get a lighter fill with full-strength text; all events got a stronger fill and darker text (`--orb-event-*-strength` variables).
- 2: the drag preview took part in the row layout of the month grid and the all-day row, so other events jumped between rows while dragging, and dragging a timed event over the all-day row grew that row and shifted the grid. The preview is now drawn over the existing rows (in its original's row) without re-packing anything.
- 3 (found while fixing 1): event fill and text ignored the event's own `color`; the color variables were resolved on the scheduler root, so every event used the accent color. Only the left border was colored. They are now mixed per event.
