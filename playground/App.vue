<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import {
  AgendaView,
  DayView,
  MonthView,
  Scheduler,
  Temporal,
  WeekView,
  applyEventEdit,
  formatTimeRange,
  removeEventOccurrence,
  type EventChangedPayload,
  type EventDeletePayload,
  type EventPointerPayload,
  type RecurrenceEditScope,
  type SelectPayload,
  type RangeChangePayload,
  type SchedulerEvent,
  type SlotPointerPayload,
} from '../src'
import { generateEvents } from './data'

// --- settings ------------------------------------------------------------------------------------

const eventCount = ref(400)
const timeZone = ref('Europe/Brussels')
const locale = ref('en-GB')
const theme = ref<'light' | 'dark'>('light')
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

const scheduler = ref<{ clearSelection(): void }>()
const date = ref<string>()
const view = ref('week')

const today = Temporal.Now.plainDateISO()
const events = shallowRef<SchedulerEvent[]>(generateEvents(eventCount.value, today))
watch(eventCount, (count) => {
  const t = performance.now()
  events.value = generateEvents(count, today)
  log('data', `generated ${count} events in ${(performance.now() - t).toFixed(1)} ms`)
})

const cssVars = computed(() => ({
  '--orb-color-accent': accent.value,
  '--orb-slot-height': `${slotHeight.value}px`,
  '--orb-event-radius': `${eventRadius.value}px`,
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
  events.value = applyEventEdit(events.value, p.occurrence, p, {
    scope: p.scope,
    timeZone: timeZone.value,
  })
  log(name, `${title(p.event)} → ${fmtTimes(p)}${p.recurring ? ` [${p.scope}]` : ''}`)
}

function onDelete(p: EventDeletePayload<SchedulerEvent>) {
  events.value = removeEventOccurrence(events.value, p.occurrence, {
    scope: p.scope,
    timeZone: timeZone.value,
  })
  log('event-delete', `${title(p.event)}${p.recurring ? ` [${p.scope}]` : ''}`)
}

function onSelect(p: SelectPayload) {
  const id = `new-${Date.now()}`
  events.value = [
    ...events.value,
    p.allDay
      ? {
          id,
          title: 'New event',
          start: p.start.toPlainDate().toString(),
          end: p.end.toPlainDate().toString(),
          color: '#ca8a04',
        }
      : {
          id,
          title: 'New event',
          start: p.start.toString(),
          end: p.end.toString(),
          color: '#ca8a04',
        },
  ]
  scheduler.value?.clearSelection()
  log('select', `created event ${fmtTimes(p)}`)
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
  events.value = [
    ...events.value,
    p.allDay
      ? { id, title: 'New all-day event', start: p.date.toString(), color: '#ca8a04' }
      : {
          id,
          title: 'New event',
          start: p.start.toString(),
          end: p.start.add({ minutes: 60 }).toString(),
          color: '#ca8a04',
        },
  ]
  log('slot-dblclick', `added event at ${p.allDay ? p.date : p.start.toPlainDateTime().toString()}`)
}
</script>

<template>
  <div class="pg" :data-theme="theme">
    <aside class="pg__sidebar">
      <h1>orb-scheduler</h1>

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
        <p class="pg__hint">
          Drag over empty slots to create an event, drag events to move them, drag their edges to
          resize. Keyboard: Alt+arrows move, Alt+Shift+arrows resize, Delete removes, arrows walk
          the grid, Shift+arrows then Enter selects, PageUp/PageDown, T, Alt+1…6. Click a date to
          open its day. On touch: swipe to navigate, long-press to drag.
        </p>
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
        <h2>Editing</h2>
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
          <input v-model.number="eventRadius" type="range" min="0" max="12" />
        </label>
        <label>
          Month event height <span>{{ monthEventHeight }}px</span>
          <input v-model.number="monthEventHeight" type="range" min="16" max="32" />
        </label>
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
        v-model:date="date"
        v-model:view="view"
        :events="events"
        :time-zone="timeZone"
        :locale="locale"
        :theme="theme"
        :slot-duration="slotDuration"
        :event-layout="eventLayout"
        :hidden-days="hideWeekends ? [6, 7] : []"
        :style="cssVars"
        :editable="editable"
        :selectable="selectable"
        :recurrence-edit-scope="scope"
        drill-down-view="day"
        :can-drop="(info) => !blockWeekends || info.start.dayOfWeek < 6"
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
        @unselect="log('unselect')"
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
        <AgendaView />
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

.pg {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  background: #f1f5f9;
  color: #0f172a;
}

.pg[data-theme='dark'] {
  background: #020617;
  color: #e2e8f0;
}

.pg__sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow-y: auto;
  border-right: 1px solid rgb(100 116 139 / 0.25);
  font-size: 0.8125rem;
}

.pg__sidebar h1 {
  margin: 0;
  font-size: 1.125rem;
}

.pg__sidebar h2 {
  margin: 0 0 0.5rem;
  color: #64748b;
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pg__sidebar section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.pg__sidebar label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.pg__sidebar label span {
  margin-left: auto;
  color: #64748b;
}

.pg__sidebar .pg__check {
  justify-content: flex-start;
}

.pg__sidebar select {
  min-width: 9rem;
}

.pg__sidebar input[type='range'] {
  width: 8rem;
}

.pg__hint {
  margin: 0;
  color: #64748b;
}

.pg__log {
  flex: 1;
  min-height: 10rem;
}

.pg__log ol {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.75rem;
}

.pg__log li {
  padding: 0.25rem 0;
  border-bottom: 1px solid rgb(100 116 139 / 0.15);
}

.pg__log code {
  color: #2563eb;
}

.pg__main {
  min-width: 0;
  padding: 1rem;
}

.pg__main--phone {
  display: flex;
  justify-content: center;
}

.pg__main--phone > .orb-scheduler {
  width: 390px;
  max-width: 100%;
}

.pg__main > .orb-scheduler {
  padding: 1rem;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.08);
}

.pg-event {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 4px 6px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 60%, #000));
  color: white;
  font-size: 0.75rem;
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
    padding: 0.5rem;
    min-height: 80vh;
  }
}
</style>
