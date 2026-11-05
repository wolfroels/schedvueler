<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  AgendaView,
  DayView,
  MonthView,
  Scheduler,
  Temporal,
  TimelineView,
  WeekView,
  YearView,
  type SchedulerPart,
  type SchedulerPt,
  type SchedulerPreset,
} from '../src'
import { PARTS, SLOTS, VIEWS, type AnatomyView, type PartInfo, type SlotInfo } from './anatomy'
import { generateEvents, generateResources } from './data'

// Everything here reads the real `data-orb-part` attributes and passes real `pt` and slots, so the
// page can only show what the scheduler really does.

const today = Temporal.Now.plainDateISO()
const resources = generateResources(9)
const events = shallowRef(generateEvents(600, today, resources))
const crews = ['crews-1', 'crews-2', 'cranes-1']

const view = ref<AnatomyView>('week')
const tab = ref<'parts' | 'slots'>('parts')
const search = ref('')
const theme = ref<'light' | 'dark'>('light')
const preset = ref<SchedulerPreset>('default')

/** Under the mouse in the list, or under the mouse in the scheduler. */
const hovered = shallowRef<SchedulerPart>()
const pinned = shallowRef<{ kind: 'part'; item: PartInfo } | { kind: 'slot'; item: SlotInfo }>()
const inspector = ref(true)
const under = shallowRef<{ chain: SchedulerPart[]; x: number; y: number }>()

/** Slots and pt being tried out on the live scheduler. */
const filledSlots = ref<string[]>([])
const styledParts = ref<SchedulerPart[]>([])

const pt = computed<SchedulerPt>(() =>
  Object.fromEntries(styledParts.value.map((name) => [name, { class: 'pp-pt-demo' }])),
)

const highlight = computed(() => {
  if (hovered.value) return hovered.value
  const p = pinned.value
  return p && (p.kind === 'part' ? p.item.name : p.item.part)
})

// Set on the page so it reaches popovers and everything else without touching the scheduler.
const highlightCss = computed(() =>
  highlight.value
    ? `[data-orb-part="${highlight.value}"] {
        outline: 2px solid #f43f5e !important;
        outline-offset: -2px;
        box-shadow: inset 0 0 0 999px rgb(244 63 94 / 0.14) !important;
      }`
    : '',
)

// --- what is on screen ---------------------------------------------------------------------------

const stage = ref<HTMLElement>()
const present = ref(new Map<string, number>())

function measure() {
  const counts = new Map<string, number>()
  stage.value?.querySelectorAll('[data-orb-part]').forEach((el) => {
    const name = el.getAttribute('data-orb-part')!
    counts.set(name, (counts.get(name) ?? 0) + 1)
  })
  present.value = counts
}

let observer: MutationObserver | undefined
onMounted(() => {
  measure()
  observer = new MutationObserver(measure)
  observer.observe(stage.value!, { childList: true, subtree: true })
})
onBeforeUnmount(() => observer?.disconnect())

// --- lists ---------------------------------------------------------------------------------------

function matches(...texts: string[]) {
  const q = search.value.trim().toLowerCase()
  return !q || texts.some((t) => t.toLowerCase().includes(q))
}

function grouped<T extends { group: string }>(list: T[]) {
  const groups = new Map<string, T[]>()
  for (const item of list) groups.set(item.group, [...(groups.get(item.group) ?? []), item])
  return [...groups]
}

const partGroups = computed(() =>
  grouped(
    PARTS.filter(
      (p) => p.views.includes(view.value) && matches(p.name, p.description, p.className),
    ),
  ),
)
const slotGroups = computed(() =>
  grouped(
    SLOTS.filter((s) => s.views.includes(view.value) && matches(s.name, s.description, s.props)),
  ),
)

const slotsForPart = (name: SchedulerPart) => SLOTS.filter((s) => s.part === name)
const partInfo = (name: SchedulerPart) => PARTS.find((p) => p.name === name)

function pinPart(name: SchedulerPart) {
  const item = partInfo(name)
  if (!item) return
  pinned.value = { kind: 'part', item }
  tab.value = 'parts'
}

function pinSlot(item: SlotInfo) {
  pinned.value = { kind: 'slot', item }
  tab.value = 'slots'
}

function toggle<T>(list: T[], value: T) {
  const at = list.indexOf(value)
  if (at >= 0) list.splice(at, 1)
  else list.push(value)
}

// --- inspecting the scheduler with the mouse -------------------------------------------------------

function onStageMove(e: MouseEvent) {
  if (!inspector.value) return
  const chain: SchedulerPart[] = []
  let el = (e.target as Element | null)?.closest('[data-orb-part]')
  while (el && stage.value?.contains(el)) {
    chain.push(el.getAttribute('data-orb-part') as SchedulerPart)
    el = el.parentElement?.closest('[data-orb-part]')
  }
  hovered.value = chain[0]
  under.value = chain.length ? { chain, x: e.clientX, y: e.clientY } : undefined
}

function onStageLeave() {
  hovered.value = undefined
  under.value = undefined
}

function onStageClick(e: MouseEvent) {
  if (!inspector.value || !e.altKey) return
  if (under.value) pinPart(under.value.chain[0]!)
}

// --- snippets --------------------------------------------------------------------------------------

const code = computed(() => {
  const p = pinned.value
  if (!p) return ''
  if (p.kind === 'part') {
    return [
      `<Scheduler :pt="pt">`,
      ``,
      `const pt = {`,
      `  ${p.item.name}: { class: 'my-class' },`,
      ...(p.item.scope
        ? [`  // or, per element:`, `  // ${p.item.name}: (${p.item.scope}) => ({ class: ... }),`]
        : []),
      `}`,
      ``,
      `/* or with plain CSS */`,
      `[data-orb-part="${p.item.name}"] { ... }`,
    ].join('\n')
  }
  return [
    `<Scheduler>`,
    `  <template #${p.item.name}="{ ${p.item.props
      .split(', ')
      .slice(0, 3)
      .join(', ')
      .replace(/\(.*?\)/g, '')} }">`,
    `    ...`,
    `  </template>`,
    `</Scheduler>`,
  ].join('\n')
})

watch(view, () => {
  hovered.value = undefined
  pinned.value = undefined
})

/** The code for what is being tried out, to copy into an app. */
const exportedCode = computed(() => {
  const lines = [
    '<Scheduler :events="events"' + (styledParts.value.length ? ' :pt="pt"' : '') + '>',
  ]
  for (const name of filledSlots.value) {
    const info = SLOTS.find((s) => s.name === name)
    lines.push(
      `  <template #${name}="{ ${info?.props.replace(/\(.*?\)/g, '') ?? ''} }">`,
      '    <!-- yours -->',
      '  </template>',
    )
  }
  lines.push('  <WeekView />', '</Scheduler>')
  if (!styledParts.value.length) return lines.join('\n')
  const pt = styledParts.value.map((p) => `  ${p}: { class: 'my-${p}' },`).join('\n')
  return `const pt: SchedulerPt = {\n${pt}\n}\n\n${lines.join('\n')}`
})

function copyExport() {
  void navigator.clipboard?.writeText(exportedCode.value)
}

function resetTrials() {
  filledSlots.value = []
  styledParts.value = []
}

function scopeKeys(scope: object | undefined) {
  return scope ? Object.keys(scope).join(', ') : ''
}
</script>

<template>
  <div class="pp" :data-theme="theme">
    <component :is="'style'">{{ highlightCss }}</component>

    <header class="pp__top">
      <a href="#/" class="pp__back">← Playground</a>
      <a href="#/examples" class="pp__back">Simple view examples</a>
      <h1>Slots and parts</h1>
      <p>
        Move over the scheduler to see what each element is called. Pick a part or slot on the right
        to see where it connects, then try it on the live scheduler.
      </p>
      <div class="pp__views" role="group" aria-label="View">
        <button
          v-for="v in VIEWS"
          :key="v.name"
          type="button"
          :class="{ 'is-active': view === v.name }"
          :aria-pressed="view === v.name"
          @click="view = v.name"
        >
          {{ v.label }}
        </button>
      </div>
      <label class="pp__check"><input v-model="inspector" type="checkbox" /> Inspector</label>
      <label class="pp__check">
        <input
          type="checkbox"
          :checked="theme === 'dark'"
          @change="theme = theme === 'dark' ? 'light' : 'dark'"
        />
        Dark
      </label>
      <label class="pp__check">
        Preset
        <select v-model="preset" aria-label="Scheduler visual preset">
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
    </header>

    <div class="pp__layout">
      <main
        ref="stage"
        class="pp__stage"
        @mousemove="onStageMove"
        @mouseleave="onStageLeave"
        @click.capture="onStageClick"
      >
        <Scheduler
          v-model:view="view"
          :events="events"
          :resources="resources"
          :pt="pt"
          :theme="theme"
          :preset="preset"
          locale="en-GB"
          time-zone="Europe/Brussels"
          editable
          selectable
        >
          <template v-for="name in filledSlots" :key="name" #[name]="scope">
            <span class="pp-slot-demo" :title="`Props: ${scopeKeys(scope)}`">#{{ name }}</span>
          </template>
          <WeekView />
          <DayView name="rooms" :days="3" label="Resource columns" :resources="crews" />
          <MonthView />
          <YearView display="heatmap" />
          <AgendaView />
          <TimelineView />
        </Scheduler>
      </main>

      <aside class="pp__panel">
        <section v-if="pinned" class="pp__detail">
          <button
            type="button"
            class="pp__close"
            aria-label="Close details"
            @click="pinned = undefined"
          >
            ×
          </button>
          <template v-if="pinned.kind === 'part'">
            <small>Part</small>
            <h2>{{ pinned.item.name }}</h2>
            <p>{{ pinned.item.description }}</p>
            <p v-if="!present.get(pinned.item.name) && pinned.item.hint" class="pp__hint">
              {{ pinned.item.hint }}
            </p>
            <dl>
              <dt>On screen now</dt>
              <dd>{{ present.get(pinned.item.name) ?? 0 }}</dd>
              <dt>Attribute</dt>
              <dd>
                <code>data-orb-part="{{ pinned.item.name }}"</code>
              </dd>
              <dt>Class</dt>
              <dd>
                <code>.{{ pinned.item.className }}</code>
              </dd>
              <template v-if="pinned.item.scope">
                <dt>pt function gets</dt>
                <dd>
                  <code>{{ pinned.item.scope }}</code>
                </dd>
              </template>
              <dt>Slots here</dt>
              <dd class="pp__chips">
                <button
                  v-for="s in slotsForPart(pinned.item.name)"
                  :key="s.name"
                  type="button"
                  @click="pinSlot(s)"
                >
                  #{{ s.name }}
                </button>
                <span v-if="!slotsForPart(pinned.item.name).length">None; use pt or CSS.</span>
              </dd>
            </dl>
            <button type="button" class="pp__try" @click="toggle(styledParts, pinned.item.name)">
              {{ styledParts.includes(pinned.item.name) ? 'Remove' : 'Try' }} a class with pt
            </button>
          </template>
          <template v-else>
            <small
              >Slot ·
              {{ pinned.item.mode === 'replaces' ? 'replaces the part' : 'inside the part' }}</small
            >
            <h2>#{{ pinned.item.name }}</h2>
            <p>{{ pinned.item.description }}</p>
            <p v-if="pinned.item.hint" class="pp__hint">{{ pinned.item.hint }}</p>
            <dl>
              <dt>Props</dt>
              <dd>
                <code>{{ pinned.item.props }}</code>
              </dd>
              <dt>Connects to</dt>
              <dd class="pp__chips">
                <button type="button" @click="pinPart(pinned.item.part)">
                  {{ pinned.item.part }}
                </button>
              </dd>
              <template v-if="pinned.item.fallsBackTo">
                <dt>Falls back to</dt>
                <dd>
                  <code>{{ pinned.item.fallsBackTo.map((n) => `#${n}`).join(', ') }}</code>
                </dd>
              </template>
              <template v-if="pinned.item.overriddenBy">
                <dt>Loses to</dt>
                <dd>
                  <code>{{ pinned.item.overriddenBy.map((n) => `#${n}`).join(', ') }}</code>
                </dd>
              </template>
            </dl>
            <button type="button" class="pp__try" @click="toggle(filledSlots, pinned.item.name)">
              {{ filledSlots.includes(pinned.item.name) ? 'Empty' : 'Fill' }} this slot
            </button>
          </template>
          <pre><code>{{ code }}</code></pre>
        </section>

        <div class="pp__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'parts'"
            :class="{ 'is-active': tab === 'parts' }"
            @click="tab = 'parts'"
          >
            Parts (pt)
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'slots'"
            :class="{ 'is-active': tab === 'slots' }"
            @click="tab = 'slots'"
          >
            Slots
          </button>
          <input v-model="search" type="search" placeholder="Search" aria-label="Search" />
        </div>

        <div v-if="filledSlots.length || styledParts.length" class="pp__active">
          Trying {{ filledSlots.length }} slots, {{ styledParts.length }} parts.
          <button type="button" @click="resetTrials">Reset</button>
          <button type="button" @click="copyExport">Copy code</button>
        </div>

        <div class="pp__list">
          <template v-if="tab === 'parts'">
            <section v-for="[group, items] in partGroups" :key="group">
              <h3>{{ group }}</h3>
              <button
                v-for="p in items"
                :key="p.name"
                type="button"
                class="pp__row"
                :class="{
                  'is-hovered': highlight === p.name,
                  'is-missing': !present.get(p.name),
                }"
                @mouseenter="hovered = p.name"
                @mouseleave="hovered = undefined"
                @focus="hovered = p.name"
                @blur="hovered = undefined"
                @click="pinPart(p.name)"
              >
                <code>{{ p.name }}</code>
                <span>{{ p.description }}</span>
                <em>{{ present.get(p.name) ?? 0 }}</em>
              </button>
            </section>
          </template>
          <template v-else>
            <section v-for="[group, items] in slotGroups" :key="group">
              <h3>{{ group }}</h3>
              <button
                v-for="s in items"
                :key="s.name"
                type="button"
                class="pp__row"
                :class="{
                  'is-hovered': pinned?.kind === 'slot' && pinned.item === s,
                  'is-missing': !present.get(s.part),
                }"
                @mouseenter="hovered = s.part"
                @mouseleave="hovered = undefined"
                @focus="hovered = s.part"
                @blur="hovered = undefined"
                @click="pinSlot(s)"
              >
                <code>#{{ s.name }}</code>
                <span>{{ s.description }}</span>
                <em>{{ s.part }}</em>
              </button>
            </section>
          </template>
        </div>
        <pre class="pp-export">{{ exportedCode }}</pre>
      </aside>
    </div>

    <div
      v-if="under && inspector"
      class="pp__tip"
      :style="{ transform: `translate(${under.x + 14}px, ${under.y + 14}px)` }"
    >
      <strong>{{ under.chain[0] }}</strong>
      <span v-if="slotsForPart(under.chain[0]!).length">
        #{{
          slotsForPart(under.chain[0]!)
            .map((s) => s.name)
            .slice(0, 3)
            .join(', #')
        }}
      </span>
      <small>{{ under.chain.slice(1, 4).join(' ‹ ') }}</small>
      <small>Alt + click for details</small>
    </div>
  </div>
</template>

<style>
.pp {
  --pp-bg: #f1f5f9;
  --pp-surface: #fff;
  --pp-text: #0f172a;
  --pp-muted: #64748b;
  --pp-border: rgb(100 116 139 / 0.25);
  --pp-accent: #f43f5e;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--pp-bg);
  color: var(--pp-text);
  font-size: 0.8125rem;
}

.pp[data-theme='dark'] {
  --pp-bg: #020617;
  --pp-surface: #0f172a;
  --pp-text: #e2e8f0;
  --pp-muted: #94a3b8;
}

.pp__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--pp-border);
}

.pp__top h1 {
  margin: 0;
  font-size: 1.125rem;
}

.pp__top p {
  flex: 1 1 22rem;
  margin: 0;
  color: var(--pp-muted);
}

.pp__back {
  color: inherit;
}

.pp__views {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.pp button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.pp__views button,
.pp__tabs button,
.pp__try,
.pp__chips button,
.pp__active button {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--pp-border);
  border-radius: 6px;
  background: var(--pp-surface);
}

.pp__views .is-active,
.pp__tabs .is-active {
  border-color: var(--pp-accent);
  color: var(--pp-accent);
}

.pp__check {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.pp__layout {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 24rem;
  min-height: 0;
}

.pp__stage {
  min-width: 0;
  min-height: 0;
  padding: 0.75rem;
}

.pp__stage > .schedvueler {
  height: 100%;
  padding: 0.75rem;
  border-radius: 10px;
}

.pp__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--pp-border);
  background: var(--pp-surface);
}

.pp__detail {
  position: relative;
  flex-shrink: 0;
  max-height: 55%;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--pp-border);
}

.pp__detail small {
  color: var(--pp-muted);
}

.pp__detail h2 {
  margin: 0;
  font-size: 1rem;
}

.pp__detail p {
  margin: 0.25rem 0;
}

.pp__hint {
  color: var(--pp-accent);
}

.pp__detail dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.25rem 0.75rem;
  margin: 0.5rem 0;
}

.pp__detail dt {
  color: var(--pp-muted);
}

.pp__detail dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.pp__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.pp__chips button {
  padding: 0 0.375rem;
  font-family: ui-monospace, monospace;
}

.pp__close {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  border: 0;
  background: none;
  font-size: 1.125rem !important;
}

.pp__detail pre {
  margin: 0.5rem 0 0;
  padding: 0.5rem;
  overflow-x: auto;
  border-radius: 6px;
  background: var(--pp-bg);
  font-size: 0.75rem;
}

.pp__tabs {
  display: flex;
  flex-shrink: 0;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
}

.pp__tabs input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--pp-border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
}

.pp__active {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem 0.5rem;
  color: var(--pp-muted);
}

.pp__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 0.5rem 1rem;
}

.pp__list h3 {
  margin: 0.75rem 0.5rem 0.25rem;
  color: var(--pp-muted);
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pp__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 0.5rem;
  width: 100%;
  padding: 0.25rem 0.5rem;
  border: 0;
  border-radius: 6px;
  background: none;
  text-align: start;
}

.pp__row code {
  font-weight: 600;
}

.pp__row span {
  grid-row: 2;
  color: var(--pp-muted);
}

.pp__row em {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  color: var(--pp-muted);
  font-size: 0.6875rem;
  font-style: normal;
}

.pp__row.is-hovered {
  background: rgb(244 63 94 / 0.14);
}

.pp__row.is-missing code {
  opacity: 0.55;
}

.pp__tip {
  position: fixed;
  z-index: 1000;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  max-width: 18rem;
  padding: 0.375rem 0.5rem;
  border-radius: 6px;
  background: #0f172a;
  color: #f8fafc;
  font-size: 0.75rem;
  pointer-events: none;
}

.pp__tip span {
  color: #fda4af;
}

.pp__tip small {
  color: #94a3b8;
}

.pp-pt-demo {
  outline: 2px dashed #16a34a !important;
  outline-offset: -2px;
}

.pp-slot-demo {
  display: inline-block;
  padding: 0 0.25rem;
  overflow: hidden;
  border-radius: 3px;
  background: #16a34a;
  color: #fff;
  font:
    600 0.6875rem/1.4 ui-monospace,
    monospace;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .pp__layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(20rem, 1fr) minmax(0, 1fr);
  }

  .pp__panel {
    border-left: 0;
    border-top: 1px solid var(--pp-border);
  }
}
.pp-export {
  margin: 0.75rem 0 0;
  padding: 0.5rem;
  overflow: auto;
  border-radius: 6px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 0.75rem;
}
</style>
