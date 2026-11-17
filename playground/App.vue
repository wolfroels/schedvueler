<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch, type Component } from 'vue'
import {
  AgendaView,
  DayView,
  GanttView,
  MonthView,
  MultiMonthView,
  Scheduler,
  SchedulerEventEditor,
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
import { de, es, fr, nl } from '../src/locales'
import { generateEvents, generateResources } from './data'
import SettingsPanel from './SettingsPanel.vue'
import {
  asAttribute,
  resolve,
  schedulerGroups,
  viewSettings,
  type Setting,
  type SettingGroup,
  type ViewKind,
} from './settings'

// --- playground-only toggles ---------------------------------------------------------------------

const eventCount = ref(400)
const resourceCount = ref(9)
const customEvents = ref(false)
const confirmRecurring = ref(false)
const phoneFrame = ref(false)

// --- views ---------------------------------------------------------------------------------------

interface PlaygroundView {
  name: string
  kind: ViewKind
  component: Component
  /** Props that are not settings, such as the label. */
  fixed?: Record<string, unknown>
  /** Starting values of this view's settings (labels for choices), over the schema's. */
  start?: Record<string, unknown>
}

const views: PlaygroundView[] = [
  { name: 'day', kind: 'time', component: DayView, start: { days: 1 } },
  {
    name: '3days',
    kind: 'time',
    component: DayView,
    fixed: { label: '3 days' },
    start: { days: 3 },
  },
  // Week views need room; on narrow screens the scheduler falls back to the day view.
  { name: 'week', kind: 'time', component: WeekView, start: { days: 7, minWidth: '600 px' } },
  {
    name: 'workweek',
    kind: 'time',
    component: WeekView,
    fixed: { label: 'Work week', scrollTime: '07:00' },
    start: { days: 5, minWidth: '600 px' },
  },
  { name: 'month', kind: 'month', component: MonthView },
  {
    name: 'multi-month',
    kind: 'multi-month',
    component: MultiMonthView,
    fixed: { label: '3 months' },
  },
  { name: 'year', kind: 'year', component: YearView },
  { name: 'agenda', kind: 'agenda', component: AgendaView },
  {
    name: 'day-resources',
    kind: 'time',
    component: DayView,
    fixed: { label: 'Day × crews' },
    start: { days: 1, resources: 'Crews and a crane', minWidth: '600 px' },
  },
  {
    name: 'week-resources',
    kind: 'time',
    component: WeekView,
    fixed: { label: 'Week × crews' },
    start: { days: 7, resources: 'Crews', groupBy: 'Date', minWidth: '600 px' },
  },
  {
    name: 'timeline',
    kind: 'timeline',
    component: TimelineView,
    fixed: { label: 'Timeline', dayStartTime: '06:00', dayEndTime: '20:00' },
  },
  {
    name: 'timeline-week',
    kind: 'timeline',
    component: TimelineView,
    fixed: { label: 'Timeline week' },
    start: { period: 'Week' },
  },
  {
    name: 'timeline-month',
    kind: 'timeline',
    component: TimelineView,
    fixed: { label: 'Timeline month' },
    start: { period: 'Month' },
  },
  { name: 'gantt', kind: 'gantt', component: GanttView },
]

/** A view's settings, with its own starting values. */
const settingsOf = (v: PlaygroundView): Setting[] =>
  viewSettings[v.kind].map((s) =>
    v.start && s.key in v.start ? { ...s, initial: v.start[s.key] } : s,
  )

// --- setting values, remembered in this browser ---------------------------------------------------

const STORE = 'schedvueler:playground-settings'
type Values = Record<string, Record<string, unknown>>

function initialValues(): Values {
  const out: Values = {}
  for (const g of schedulerGroups)
    out[g.id] = Object.fromEntries(g.settings.map((s) => [s.key, s.initial]))
  for (const v of views)
    out[`view:${v.name}`] = Object.fromEntries(settingsOf(v).map((s) => [s.key, s.initial]))
  return out
}

function load(): Values {
  const base = initialValues()
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Values
    for (const [group, entries] of Object.entries(saved)) {
      if (!base[group]) continue
      for (const [key, value] of Object.entries(entries))
        if (key in base[group]) base[group][key] = value
    }
  } catch {
    // No storage, or something unreadable: start fresh.
  }
  return base
}

const values = reactive<Values>(load())
watch(
  values,
  () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(values))
    } catch {
      // Private mode or full storage: settings just don't survive a reload.
    }
  },
  { deep: true },
)

const viewGroup = (v: PlaygroundView): SettingGroup => ({
  id: `view:${v.name}`,
  title: `View: ${(v.fixed?.label as string | undefined) ?? v.name[0]!.toUpperCase() + v.name.slice(1)}`,
  settings: settingsOf(v),
})

const scheduler = ref<{ clearSelection(): void }>()
const editor = ref<InstanceType<typeof SchedulerEventEditor>>()
const date = ref<string>()
const view = ref('week')

const activeView = computed(() => views.find((v) => v.name === view.value) ?? views[0]!)
/** The panel: the scheduler's groups, with the active view's settings first. */
const panelGroups = computed(() => [viewGroup(activeView.value), ...schedulerGroups])

function setValue(group: string, key: string, value: unknown) {
  values[group]![key] = value
}

function resetValues(group: string | null, key?: string) {
  const fresh = initialValues()
  if (group === null) {
    for (const g of Object.keys(values)) Object.assign(values[g]!, fresh[g])
    return
  }
  if (key) values[group]![key] = fresh[group]![key]
  else Object.assign(values[group]!, fresh[group])
}

/** What a group's setting passes, by key. */
function resolved(group: SettingGroup): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const s of group.settings) {
    if (s.control.kind === 'code') continue
    const value = resolve(s, values[group.id]![s.key])
    if (value !== undefined) out[s.key] = value
  }
  return out
}

const settingValue = (key: string) => {
  for (const g of schedulerGroups) {
    const s = g.settings.find((x) => x.key === key)
    if (s) return resolve(s, values[g.id]![key])
  }
  return undefined
}

// --- what the scheduler gets ---------------------------------------------------------------------

const draftDemo = {
  count: 3,
  apply: () => log('draft', 'apply'),
  discard: () => log('draft', 'discard'),
}

const options = computed(() => {
  const out: Record<string, unknown> = {}
  for (const g of schedulerGroups) if (g.id !== 'css') Object.assign(out, resolved(g))
  if (out.draft === 'draft-demo') out.draft = draftDemo
  return out
})

const timeZone = computed(() => settingValue('timeZone') as string)
const locale = computed(() => settingValue('locale') as string)
const theme = computed(() => settingValue('theme') as 'light' | 'dark' | 'auto')
const preset = computed(() => settingValue('preset') as SchedulerPreset)

// The sidebar follows the scheduler's light or dark look.
const prefersDark =
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined
const systemDark = shallowRef(prefersDark?.matches ?? false)
prefersDark?.addEventListener('change', (e) => (systemDark.value = e.matches))
const scheme = computed<'light' | 'dark'>(() =>
  theme.value === 'auto' ? (systemDark.value ? 'dark' : 'light') : theme.value,
)

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
// A new preset or scheme starts from its own accent; the picker can still override it.
watch([preset, scheme], () => {
  values.css!['--orb-color-accent'] = presetAccents[preset.value][scheme.value]
})

const accent = computed(() => values.css!['--orb-color-accent'] as string)
const cssVars = computed(() => {
  const vars = resolved(schedulerGroups.find((g) => g.id === 'css')!) as Record<string, string>
  if (preset.value !== 'default') delete vars['--orb-event-radius']
  return {
    ...vars,
    '--orb-color-accent-contrast': createTheme(accent.value)['--orb-color-accent-contrast']!,
  }
})

const viewProps = (v: PlaygroundView) => ({ name: v.name, ...v.fixed, ...resolved(viewGroup(v)) })

const packs = { Nederlands: nl, Français: fr, Deutsch: de, Español: es } as const
const editorMessages = computed(
  () => packs[values.time!.messages as keyof typeof packs]?.editor ?? undefined,
)

// --- copy as code --------------------------------------------------------------------------------

const code = computed(() => {
  const lines: string[] = []
  for (const g of schedulerGroups)
    for (const s of g.settings) {
      const a = asAttribute(s, values[g.id]![s.key])
      if (a) lines.push(`  ${a}`)
    }
  const v = activeView.value
  const viewLines: string[] = []
  // The component's own defaults, so a week view does not get `:days="7"`.
  const own: Record<string, unknown> =
    v.component === WeekView ? { days: 7 } : v.component === DayView ? { days: 1 } : {}
  for (const s of settingsOf(v)) {
    const setting = s.key in own ? { ...s, libraryDefault: own[s.key] } : s
    const a = asAttribute(setting, values[`view:${v.name}`]![s.key])
    if (a) viewLines.push(a)
  }
  const tag = (v.component as { __name?: string }).__name ?? 'View'
  return [
    '<Scheduler',
    ...lines,
    '>',
    `  <${tag} name="${v.name}"${viewLines.length ? ` ${viewLines.join(' ')}` : ''} />`,
    '</Scheduler>',
  ].join('\n')
})

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

// --- data ----------------------------------------------------------------------------------------

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
  // The selection stays visible while the editor is open; closing it clears the selection.
  editor.value?.create(p)
  log('select', fmtTimes(p))
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
  editor.value?.create({
    start: p.start,
    end: p.allDay ? p.start.add({ days: 1 }) : p.start.add({ minutes: 60 }),
    allDay: p.allDay,
    resourceId: p.resourceId,
  })
  log('slot-dblclick', p.allDay ? p.date.toString() : p.start.toPlainDateTime().toString())
}

// Groups (crews, cranes) are headings in the timeline; events go on their members.
const editorResources = computed(() => resources.value.filter((r) => r.parentId != null))

const menu = (name: string, detail: string) => log(name, detail)
</script>

<template>
  <div class="pg" :data-theme="scheme" :style="{ '--pg-accent': accent }">
    <aside class="pg__sidebar">
      <header class="pg__head">
        <h1>schedvueler</h1>
        <nav class="pg__nav">
          <a class="pg__link" href="#/examples">Simple view examples</a>
          <a class="pg__link" href="#/parts">Slots and parts</a>
          <a class="pg__link" href="#/theme">Theme</a>
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
          Drag over empty slots or double-click one to create an event, double-click an event to
          edit it, drag events to move them and their edges to resize. Right-clicks show up in the
          emits. Click a date to open its day. On touch, swipe to navigate and long-press to drag.
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
        <h2>Settings</h2>
        <p class="pg__hint">
          Every option of the scheduler and of the open view. Changes apply at once and are kept in
          this browser.
        </p>
        <SettingsPanel
          :groups="panelGroups"
          :values="values"
          :code="code"
          @set="setValue"
          @reset="resetValues"
        />
      </section>

      <section>
        <h2>Playground</h2>
        <label class="pg__check">
          <input v-model="customEvents" type="checkbox" /> Custom event slot
        </label>
        <label class="pg__check">
          <input v-model="phoneFrame" type="checkbox" /> Phone frame (390 px)
        </label>
        <label class="pg__check">
          <input v-model="confirmRecurring" type="checkbox" /> Ask for scope (prompt)
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
        <h2>History</h2>
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
        v-bind="options"
        :style="cssVars"
        @range-change="onRange"
        @navigate="(p) => log('navigate', `${p.reason}: ${p.from} → ${p.to}`)"
        @view-change="(p) => log('view-change', `${p.from} → ${p.to}`)"
        @event-click="onEventClick"
        @event-dblclick="(p) => editor?.edit(p)"
        @event-contextmenu="(p) => menu('event-contextmenu', title(p.event))"
        @slot-contextmenu="(p) => menu('slot-contextmenu', p.start.toPlainDateTime().toString())"
        @date-contextmenu="(p) => menu('date-contextmenu', p.date.toString())"
        @resource-contextmenu="(p) => menu('resource-contextmenu', p.resource.title ?? '')"
        @slot-click="(p) => log('slot-click', `${p.allDay ? p.date : p.start.toPlainDateTime()}`)"
        @slot-dblclick="onSlotDblClick"
        @date-click="(p) => log('date-click', p.date.toString())"
        @more-click="(p) => log('more-click', `${p.date}: ${p.hiddenCount} hidden`)"
        @event-drag-start="(p) => log('event-drag-start', `${title(p.event)} (${p.kind})`)"
        @event-drag-cancel="(p) => log('event-drag-cancel', `${title(p.event)}: ${p.reason}`)"
        @event-change-failed="(p) => log('event-change-failed', `${title(p.event)}: ${p.reason}`)"
        @before-event-drop="beforeChange"
        @before-event-resize="beforeChange"
        @event-drop="(p) => onChanged('event-drop', p)"
        @event-resize="(p) => onChanged('event-resize', p)"
        @event-delete="onDelete"
        @event-duplicate="(p) => log('event-duplicate', title(p.event))"
        @events-copy="(p) => log('events-copy', `${p.occurrences.length}${p.cut ? ' (cut)' : ''}`)"
        @events-paste="(p) => log('events-paste', `${p.items.length}`)"
        @event-leave="(p) => log('event-leave', title(p.event))"
        @native-drop="() => log('native-drop')"
        @suggestion-click="(p) => log('suggestion-click', String(p.suggestion.start))"
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

        <component :is="v.component" v-for="v in views" :key="v.name" v-bind="viewProps(v)" />
      </Scheduler>
      <SchedulerEventEditor
        ref="editor"
        :events="events"
        :resources="editorResources"
        :time-zone="timeZone"
        :locale="locale"
        :theme="theme"
        :preset="preset"
        :messages="editorMessages"
        @update:events="(next, label) => history.commit(next, label)"
        @close="scheduler?.clearSelection()"
      />
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
