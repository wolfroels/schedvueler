<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import {
  AgendaView,
  DayView,
  MonthView,
  Scheduler,
  Temporal,
  TimelineView,
  WeekView,
  YearView,
  applyEventEdits,
  createTheme,
  formatTimeRange,
  removeEventOccurrences,
  useHistory,
  vOrbDraggable,
  type EventChangedPayload,
  type EventDeletePayload,
  type EventReceivePayload,
  type ExternalEventTemplate,
  type EventPointerPayload,
  type RecurrenceEditScope,
  type SelectPayload,
  type RangeChangePayload,
  type SchedulerEvent,
  type SchedulerPreset,
  type SlotPointerPayload,
} from '../src'
import { generateEvents, generateResources } from './data'

// --- settings ------------------------------------------------------------------------------------

const eventCount = ref(400)
const resourceCount = ref(9)
const timeZone = ref('Europe/Brussels')
const locale = ref('en-GB')
const theme = ref<'light' | 'dark'>('light')
const preset = ref<SchedulerPreset>('default')
const eventLayout = ref<'columns' | 'stack'>('columns')
const hideWeekends = ref(false)
const slotDuration = ref(30)
const customEvents = ref(false)
const editable = ref(true)
const selectable = ref(true)
const blockWeekends = ref(false)
const scope = ref<RecurrenceEditScope>('this')
const confirmRecurring = ref(false)
const phoneFrame = ref(false)

const accent = ref('#2563eb')
const slotHeight = ref(36)
const eventRadius = ref(6)
const monthEventHeight = ref(22)
const presetAccents: Record<SchedulerPreset, Record<'light' | 'dark', string>> = {
  default: { light: '#2563eb', dark: '#60a5fa' },
  modern: { light: '#1769aa', dark: '#5ab1e5' },
  glass: { light: '#0e7490', dark: '#67d2d0' },
  glassmorphism: { light: '#0e7490', dark: '#67d2d0' },
  neumorphic: { light: '#167c72', dark: '#65c9b8' },
  clean: { light: '#28715f', dark: '#76c6aa' },
  bento: { light: '#0f766e', dark: '#5eead4' },
  'neo-brutalism': { light: '#ffca3a', dark: '#ffdf4f' },
  'cyber-y2k': { light: '#df3295', dark: '#ff53c8' },
}
watch([preset, theme], () => {
  accent.value = presetAccents[preset.value][theme.value]
})

const scheduler = ref<{ clearSelection(): void }>()
const date = ref<string>()
const view = ref('week')

const today = Temporal.Now.plainDateISO()
const resources = shallowRef(generateResources(resourceCount.value))
const events = shallowRef<SchedulerEvent[]>(
  generateEvents(eventCount.value, today, resources.value),
)
watch([eventCount, resourceCount], ([count, resourceTotal]) => {
  const t = performance.now()
  resources.value = generateResources(resourceTotal)
  events.value = generateEvents(count, today, resources.value)
  history.reset()
  log(
    'data',
    `generated ${count} events, ${resources.value.length} resources in ${(performance.now() - t).toFixed(1)} ms`,
  )
})

// Every edit goes through history.commit, so Ctrl+Z / Ctrl+Shift+Z undo and redo it.
const history = useHistory(events, { keyboard: true })

const cssVars = computed(() => ({
  '--orb-color-accent': accent.value,
  '--orb-color-accent-contrast': createTheme(accent.value)['--orb-color-accent-contrast']!,
  '--orb-slot-height': `${slotHeight.value}px`,
  ...(preset.value === 'default' ? { '--orb-event-radius': `${eventRadius.value}px` } : {}),
  '--orb-month-event-height': `${monthEventHeight.value}px`,
}))

// --- emit log ------------------------------------------------------------------------------------

interface LogEntry {
  id: number
  name: string
  detail: string
}
const entries = ref<LogEntry[]>([])
let nextId = 0
function log(name: string, detail = '') {
  entries.value = [{ id: nextId++, name, detail }, ...entries.value].slice(0, 40)
}

const title = (e: SchedulerEvent) => e.title ?? String(e.id)

const shortcuts: { label: string; keys: string[] }[] = [
  { label: 'Move event', keys: ['Alt', 'arrows'] },
  { label: 'Resize event', keys: ['Alt', 'Shift', 'arrows'] },
  { label: 'Remove event', keys: ['Delete'] },
  { label: 'Walk the grid', keys: ['arrows'] },
  { label: 'Select a range', keys: ['Shift', 'arrows', 'Enter'] },
  { label: 'Previous, next', keys: ['PageUp', 'PageDown'] },
  { label: 'Today', keys: ['T'] },
  { label: 'Switch view', keys: ['Alt', '1…9'] },
]

function onRange(p: RangeChangePayload) {
  log('range-change', `${p.view}: ${p.start} → ${p.end}`)
}
function onEventClick(p: EventPointerPayload<SchedulerEvent>) {
  const o = p.occurrence
  log(
    'event-click',
    `${title(p.event)}${o.allDay ? '' : ` (${formatTimeRange(o.start, o.end, locale.value)})`}`,
  )
}
// --- editing ---------------------------------------------------------------------------------

const fmtTimes = (p: {
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
}) =>
  p.allDay
    ? `${p.start.toPlainDate()} (all day)`
    : `${p.start.toPlainDate()} ${formatTimeRange(p.start, p.end, locale.value)}`

/** Applies a drop or resize to the data; the scheduler keeps showing it until `events` changes. */
function onChanged(name: string, p: EventChangedPayload<SchedulerEvent>) {
  history.commit(
    applyEventEdits(events.value, [p, ...p.others], { scope: p.scope, timeZone: timeZone.value }),
    `${name === 'event-drop' ? 'Move' : 'Resize'} ${title(p.event)}`,
  )
  const moved =
    p.resourceIds.join() !== p.oldResourceIds.join() ? ` @ ${p.resourceIds.join(', ')}` : ''
  log(name, `${title(p.event)} → ${fmtTimes(p)}${moved}${p.recurring ? ` [${p.scope}]` : ''}`)
}

function onDelete(p: EventDeletePayload<SchedulerEvent>) {
  history.commit(
    removeEventOccurrences(events.value, [p.occurrence, ...p.others], {
      scope: p.scope,
      timeZone: timeZone.value,
    }),
    `Delete ${title(p.event)}`,
  )
  log('event-delete', `${title(p.event)}${p.recurring ? ` [${p.scope}]` : ''}`)
}

function onSelect(p: SelectPayload) {
  const id = `new-${Date.now()}`
  history.commit(
    [
      ...events.value,
      p.allDay
        ? {
            id,
            title: 'New event',
            start: p.start.toPlainDate().toString(),
            end: p.end.toPlainDate().toString(),
            color: '#ca8a04',
            resourceId: p.resourceId,
          }
        : {
            id,
            title: 'New event',
            start: p.start.toString(),
            end: p.end.toString(),
            color: '#ca8a04',
            resourceId: p.resourceId,
          },
    ],
    'Create event',
  )
  scheduler.value?.clearSelection()
  log('select', `created event ${fmtTimes(p)}`)
}

// --- dragging in from the sidebar ------------------------------------------------------------

const templates: ExternalEventTemplate[] = [
  { title: 'Inspection', color: '#0891b2', duration: 90 },
  { title: 'Concrete pour', color: '#ea580c', duration: 240 },
  {
    title: 'Client call (14:00)',
    color: '#db2777',
    duration: 30,
    allDay: false,
    startTime: '14:00',
  },
  { title: 'Holiday', color: '#16a34a', allDay: true, days: 3 },
]

/** Adds the dropped event; one undo step. */
function onReceive(p: EventReceivePayload) {
  const t = p.template
  const base = {
    id: `drop-${Date.now()}`,
    title: t.title,
    color: t.color,
    resourceId: p.resourceId,
  }
  history.commit(
    [
      ...events.value,
      p.allDay
        ? { ...base, start: p.start.toPlainDate().toString(), end: p.end.toPlainDate().toString() }
        : { ...base, start: p.start.toString(), end: p.end.toString() },
    ],
    `Add ${t.title}`,
  )
  log('event-receive', `${t.title} → ${fmtTimes(p)}${p.resourceId ? ` @ ${p.resourceId}` : ''}`)
}

/** Shows how a before-event can ask the user (asynchronously) before a change is applied. */
function beforeChange(p: {
  recurring: boolean
  scope: RecurrenceEditScope
  waitUntil(x: Promise<unknown>): void
}) {
  if (!p.recurring || !confirmRecurring.value) return
  p.waitUntil(
    new Promise<boolean>((resolve) =>
      setTimeout(() => {
        const answer = window.prompt('Change which occurrences? this / following / all', p.scope)
        if (answer === 'this' || answer === 'following' || answer === 'all') {
          p.scope = answer
          resolve(true)
        } else resolve(false)
      }),
    ),
  )
}

function onSlotDblClick(p: SlotPointerPayload) {
  // Adding an event creates a new array; the store re-reads only the new object.
  const id = `new-${Date.now()}`
  history.commit(
    [
      ...events.value,
      p.allDay
        ? {
            id,
            title: 'New all-day event',
            start: p.date.toString(),
            color: '#ca8a04',
            resourceId: p.resourceId,
          }
        : {
            id,
            title: 'New event',
            start: p.start.toString(),
            end: p.start.add({ minutes: 60 }).toString(),
            color: '#ca8a04',
            resourceId: p.resourceId,
          },
    ],
    'Add event',
  )
  log('slot-dblclick', `added event at ${p.allDay ? p.date : p.start.toPlainDateTime().toString()}`)
}
</script>

<template>
  <div class="pg" :data-theme="theme" :style="{ '--pg-accent': accent }">
    <aside class="pg__sidebar">
      <header class="pg__head">
        <h1>schedvueler</h1>
        <nav class="pg__nav">
          <a class="pg__link" href="#/examples">Simple view examples</a>
          <a class="pg__link" href="#/parts">Slots and parts</a>
        </nav>
      </header>

      <section>
        <h2>Data</h2>
        <label>
          Events
          <select v-model.number="eventCount">
            <option :value="0">none</option>
            <option :value="400">400</option>
            <option :value="2000">2 000</option>
            <option :value="10000">10 000</option>
            <option :value="20000">20 000</option>
          </select>
        </label>
        <label>
          Resources
          <select v-model.number="resourceCount">
            <option :value="9">9</option>
            <option :value="60">60</option>
            <option :value="600">600</option>
          </select>
        </label>
        <p class="pg__hint">
          Drag over empty slots to create an event, drag events to move them, drag their edges to
          resize. Click a date to open its day. On touch, swipe to navigate and long-press to drag.
        </p>
        <dl class="pg__keys">
          <div v-for="s in shortcuts" :key="s.label">
            <dt>{{ s.label }}</dt>
            <dd>
              <kbd v-for="k in s.keys" :key="k">{{ k }}</kbd>
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>Options</h2>
        <label>
          Time zone
          <select v-model="timeZone">
            <option>Europe/Brussels</option>
            <option>America/New_York</option>
            <option>Asia/Tokyo</option>
            <option>UTC</option>
          </select>
        </label>
        <label>
          Locale
          <select v-model="locale">
            <option>en-GB</option>
            <option>en-US</option>
            <option>nl-BE</option>
            <option>fr-BE</option>
            <option>de-DE</option>
          </select>
        </label>
        <label>
          Slot
          <select v-model.number="slotDuration">
            <option :value="15">15 min</option>
            <option :value="30">30 min</option>
            <option :value="60">60 min</option>
          </select>
        </label>
        <label>
          Overlap
          <select v-model="eventLayout">
            <option value="columns">columns</option>
            <option value="stack">stack</option>
          </select>
        </label>
        <label class="pg__check"
          ><input v-model="hideWeekends" type="checkbox" /> Hide weekends</label
        >
        <label class="pg__check">
          <input v-model="customEvents" type="checkbox" /> Custom event slot
        </label>
        <label class="pg__check">
          <input v-model="phoneFrame" type="checkbox" /> Phone frame (390 px)
        </label>
      </section>

      <section>
        <h2>Drag into the scheduler</h2>
        <ul class="pg__templates">
          <li v-for="t in templates" :key="t.title" v-orb-draggable="t" :style="{ '--c': t.color }">
            {{ t.title }}
            <small>{{ t.allDay ? `all day, ${t.days ?? 1} d` : `${t.duration} min` }}</small>
          </li>
        </ul>
      </section>

      <section>
        <h2>Editing</h2>
        <div class="pg__history">
          <button
            class="pg__btn"
            type="button"
            :disabled="!history.canUndo.value"
            :title="history.undoLabel.value"
            @click="history.undo()"
          >
            Undo
          </button>
          <button
            class="pg__btn"
            type="button"
            :disabled="!history.canRedo.value"
            :title="history.redoLabel.value"
            @click="history.redo()"
          >
            Redo
          </button>
          <span>{{ history.undoLabel.value ?? '' }}</span>
        </div>
        <label class="pg__check"><input v-model="editable" type="checkbox" /> Editable</label>
        <label class="pg__check"><input v-model="selectable" type="checkbox" /> Selectable</label>
        <label class="pg__check">
          <input v-model="blockWeekends" type="checkbox" /> Refuse drops on weekends
        </label>
        <label>
          Recurring scope
          <select v-model="scope">
            <option value="this">this</option>
            <option value="following">following</option>
            <option value="all">all</option>
          </select>
        </label>
        <label class="pg__check">
          <input v-model="confirmRecurring" type="checkbox" /> Ask for scope (prompt)
        </label>
      </section>

      <section>
        <h2>Appearance</h2>
        <label>
          Visual preset
          <select v-model="preset">
            <option value="default">Default</option>
            <option value="modern">Modern</option>
            <option value="glassmorphism">Glassmorphism</option>
            <option value="neumorphic">Neumorphic</option>
            <option value="clean">Clean</option>
            <option value="bento">Bento grids</option>
            <option value="neo-brutalism">Neo-brutalism</option>
            <option value="cyber-y2k">Retro futurism / Cyber-Y2K</option>
          </select>
        </label>
        <label class="pg__check">
          <input
            type="checkbox"
            :checked="theme === 'dark'"
            @change="theme = theme === 'dark' ? 'light' : 'dark'"
          />
          Dark theme
        </label>
      </section>

      <section>
        <h2>Theme variables</h2>
        <label>Accent <input v-model="accent" type="color" /></label>
        <label>
          Slot height <span>{{ slotHeight }}px</span>
          <input v-model.number="slotHeight" type="range" min="20" max="72" />
        </label>
        <label>
          Event radius <span>{{ eventRadius }}px</span>
          <input
            v-model.number="eventRadius"
            type="range"
            min="0"
            max="12"
            :disabled="preset !== 'default'"
          />
        </label>
        <label>
          Month event height <span>{{ monthEventHeight }}px</span>
          <input v-model.number="monthEventHeight" type="range" min="16" max="32" />
        </label>
        <p v-if="preset !== 'default'" class="pg__hint">
          Starts with the preset accent; choose any color to override it. Event radius follows the
          preset.
        </p>
      </section>

      <section class="pg__log">
        <h2>Emits</h2>
        <ol>
          <li v-for="e in entries" :key="e.id">
            <code>{{ e.name }}</code> <span>{{ e.detail }}</span>
          </li>
        </ol>
      </section>
    </aside>

    <main class="pg__main" :class="{ 'pg__main--phone': phoneFrame }">
      <Scheduler
        ref="scheduler"
        storage-key="schedvueler:playground"
        v-model:date="date"
        v-model:view="view"
        :events="events"
        :resources="resources"
        :time-zone="timeZone"
        :locale="locale"
        :theme="theme"
        :preset="preset"
        :slot-duration="slotDuration"
        :event-layout="eventLayout"
        :hidden-days="hideWeekends ? [6, 7] : []"
        :style="cssVars"
        :editable="editable"
        :selectable="selectable"
        :recurrence-edit-scope="scope"
        event-selection
        drill-down-view="day"
        :can-drop="(info) => !blockWeekends || info.start.dayOfWeek < 6"
        :can-receive="(info) => !blockWeekends || info.start.dayOfWeek < 6"
        @range-change="onRange"
        @navigate="(p) => log('navigate', `${p.reason}: ${p.from} → ${p.to}`)"
        @view-change="(p) => log('view-change', `${p.from} → ${p.to}`)"
        @event-click="onEventClick"
        @slot-click="(p) => log('slot-click', `${p.allDay ? p.date : p.start.toPlainDateTime()}`)"
        @slot-dblclick="onSlotDblClick"
        @date-click="(p) => log('date-click', p.date.toString())"
        @more-click="(p) => log('more-click', `${p.date}: ${p.hiddenCount} hidden`)"
        @event-drag-start="(p) => log('event-drag-start', `${title(p.event)} (${p.kind})`)"
        @event-drag-cancel="(p) => log('event-drag-cancel', `${title(p.event)}: ${p.reason}`)"
        @before-event-drop="beforeChange"
        @before-event-resize="beforeChange"
        @event-drop="(p) => onChanged('event-drop', p)"
        @event-resize="(p) => onChanged('event-resize', p)"
        @event-delete="onDelete"
        @select="onSelect"
        @event-receive="onReceive"
        @unselect="log('unselect')"
        @resource-click="(p) => log('resource-click', p.resource.title)"
        @resource-toggle="
          (p) => log('resource-toggle', `${p.resource.title}: ${p.expanded ? 'open' : 'closed'}`)
        "
        @visible-resources-change="
          (p) =>
            log(
              'visible-resources-change',
              `${p.resourceIds.length} rows: ${p.resourceIds[0]} … ${p.resourceIds.at(-1)}`,
            )
        "
      >
        <template v-if="customEvents" #time-event="{ title, timeText, color }">
          <div class="pg-event" :style="{ '--c': color ?? accent }">
            <strong>{{ title }}</strong>
            <small>{{ timeText }}</small>
          </div>
        </template>

        <DayView />
        <DayView name="3days" :days="3" label="3 days" />
        <!-- Week views need room; on narrow screens the scheduler falls back to the day view. -->
        <WeekView :min-width="600" />
        <WeekView
          name="workweek"
          :days="5"
          label="Work week"
          scroll-time="07:00"
          :min-width="600"
        />
        <MonthView />
        <YearView display="heatmap" />
        <AgendaView />
        <DayView
          name="day-resources"
          label="Day × crews"
          :resources="['crews-1', 'crews-2', 'crews-3', 'cranes-1']"
          :min-width="600"
        />
        <WeekView
          name="week-resources"
          label="Week × crews"
          :resources="['crews-1', 'crews-2']"
          group-by="date"
          :min-width="600"
        />
        <TimelineView label="Timeline" day-start-time="06:00" day-end-time="20:00" />
        <TimelineView name="timeline-week" label="Timeline week" period="week" />
        <TimelineView
          name="timeline-month"
          label="Timeline month"
          period="month"
          :slot-width="56"
        />
      </Scheduler>
    </main>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}

body {
  font-family:
    Inter,
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    sans-serif;
}

/* Playground chrome: one slate ramp, three text roles. The accent follows the accent picker and
   only marks checked controls and focus, so the scheduler stays the one colourful thing. */
.pg {
  --pg-bg: #f1f5f9;
  --pg-control: #ffffff;
  --pg-text: #0f172a;
  --pg-text-2: #475569;
  --pg-muted: #5b6b80;
  --pg-line: rgb(15 23 42 / 0.1);
  --pg-hover: rgb(15 23 42 / 0.05);
  --pg-control-height: 28px;
  --pg-mono: ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, monospace;

  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  background: var(--pg-bg);
  color: var(--pg-text);
  accent-color: var(--pg-accent);
}

.pg[data-theme='dark'] {
  --pg-bg: #020617;
  --pg-control: #0f172a;
  --pg-text: #e2e8f0;
  --pg-text-2: #cbd5e1;
  --pg-muted: #94a3b8;
  --pg-line: rgb(226 232 240 / 0.12);
  --pg-hover: rgb(226 232 240 / 0.06);
  color-scheme: dark;
}

.pg__sidebar {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px;
  overflow-y: auto;
  border-right: 1px solid var(--pg-line);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.pg__sidebar :focus-visible {
  outline: 2px solid var(--pg-accent);
  outline-offset: 1px;
}

.pg__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pg__sidebar h1 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.pg__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 -8px;
}

.pg__link {
  display: flex;
  align-items: center;
  height: var(--pg-control-height);
  padding: 0 8px;
  border-radius: 6px;
  color: var(--pg-text-2);
  text-decoration: none;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.pg__link:hover {
  background: var(--pg-hover);
  color: var(--pg-text);
}

.pg__sidebar section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pg__sidebar h2 {
  margin: 0 0 4px;
  color: var(--pg-muted);
  font-size: 0.75rem;
  font-weight: 500;
}

.pg__sidebar label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: var(--pg-control-height);
}

.pg__sidebar label span {
  margin-left: auto;
  color: var(--pg-muted);
  font-variant-numeric: tabular-nums;
}

.pg__sidebar .pg__check {
  justify-content: flex-start;
}

.pg__sidebar input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
}

.pg__sidebar select,
.pg__btn {
  height: var(--pg-control-height);
  border: 1px solid var(--pg-line);
  border-radius: 6px;
  background-color: var(--pg-control);
  color: inherit;
  font: inherit;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}

.pg__sidebar select {
  width: 144px;
  padding: 0 8px;
}

.pg__sidebar select:hover,
.pg__btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--pg-text) 28%, transparent);
}

.pg__btn {
  padding: 0 12px;
  font-weight: 500;
  cursor: pointer;
}

.pg__btn:active:not(:disabled) {
  transform: scale(0.98);
}

.pg__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.pg__sidebar input[type='range'] {
  width: 96px;
  margin: 0;
}

.pg__sidebar input[type='color'] {
  width: var(--pg-control-height);
  height: var(--pg-control-height);
  padding: 2px;
  border: 1px solid var(--pg-line);
  border-radius: 6px;
  background: var(--pg-control);
  cursor: pointer;
}

.pg__templates {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pg__templates li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: var(--pg-control-height);
  padding: 4px 8px;
  border-left: 3px solid var(--c);
  border-radius: 6px;
  background: color-mix(in srgb, var(--c) 14%, transparent);
  font-weight: 500;
  cursor: grab;
}

.pg__templates small {
  color: var(--pg-text-2);
  font-size: 0.75rem;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.pg__history {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.pg__history span {
  overflow: hidden;
  margin-left: 4px;
  color: var(--pg-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pg__hint {
  margin: 4px 0 0;
  color: var(--pg-text-2);
}

.pg__keys {
  display: flex;
  flex-direction: column;
  margin: 8px 0 0;
}

.pg__keys div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: var(--pg-control-height);
}

.pg__keys dt {
  color: var(--pg-text-2);
}

.pg__keys dd {
  display: flex;
  gap: 4px;
  margin: 0;
}

.pg__keys kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border: 1px solid var(--pg-line);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--pg-control);
  color: var(--pg-text-2);
  font-family: var(--pg-mono);
  font-size: 0.6875rem;
}

.pg__log {
  flex: 1;
  min-height: 160px;
}

.pg__log ol {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.75rem;
}

.pg__log li {
  padding: 4px 0;
  border-bottom: 1px solid var(--pg-line);
  color: var(--pg-muted);
  font-variant-numeric: tabular-nums;
}

.pg__log code {
  color: var(--pg-text);
  font-family: var(--pg-mono);
}

.pg__main {
  min-width: 0;
  padding: 16px;
}

.pg__main--phone {
  display: flex;
  justify-content: center;
}

.pg__main--phone > .schedvueler {
  width: 390px;
  max-width: 100%;
}

.pg__main > .schedvueler {
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.08);
}

.pg-event {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 4px 8px;
  border-radius: var(--orb-event-radius);
  background: color-mix(in srgb, var(--c) 85%, #000);
  color: white;
  font-size: 0.75rem;
}

.pg-event strong {
  font-weight: 600;
}

@media (max-width: 800px) {
  .pg {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .pg__sidebar {
    max-height: 35vh;
  }

  .pg__main {
    padding: 8px;
    height: 80vh;
  }
}
</style>
