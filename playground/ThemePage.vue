<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { AgendaView, DayView, MonthView, Scheduler, Temporal, TimelineView, WeekView } from '../src'
import { generateEvents, generateResources } from './data'
import { THEME_GROUPS, isColorVar, selectorFor, type ThemeMode } from './themeVars'

const ALL_VARS = THEME_GROUPS.flatMap((g) => g.vars)

const mode = ref<ThemeMode>('light')
const view = ref('week')
const date = ref(Temporal.Now.plainDateISO().toString())
const resources = generateResources(9)
const events = generateEvents(160, Temporal.Now.plainDateISO(), resources)

// What the user typed, per mode; a token missing here has its stylesheet default.
const edits = reactive<Record<ThemeMode, Record<string, string>>>({ light: {}, dark: {} })

const defaultOf = (name: string, m: ThemeMode = mode.value) => {
  const v = ALL_VARS.find((x) => x.name === name)!
  return m === 'dark' ? v.dark : v.light
}
const valueOf = (name: string, m: ThemeMode = mode.value) => edits[m][name] ?? defaultOf(name, m)
const isChanged = (name: string) => name in edits[mode.value]

function setValue(name: string, value: string) {
  if (value.trim() === defaultOf(name)) delete edits[mode.value][name]
  else edits[mode.value][name] = value
}
const reset = (name: string) => delete edits[mode.value][name]
function resetAll() {
  edits[mode.value] = {}
}
const changedCount = computed(() => Object.keys(edits[mode.value]).length)

// --- live preview: a style element with only the edited tokens, after the library sheet ---------

const liveCss = computed(() =>
  (['light', 'dark'] as const)
    .map((m) => {
      const lines = Object.entries(edits[m]).map(([k, v]) => `  ${k}: ${v};`)
      // [data-theme] keeps light edits ahead of the preset rules; they have the same weight.
      const sel = m === 'dark' ? selectorFor('dark') : `${selectorFor('light')}[data-theme='light']`
      return lines.length ? `${sel} {\n${lines.join('\n')}\n}` : ''
    })
    .join('\n'),
)

// --- the stylesheet to copy ----------------------------------------------------------------------

const copyCss = computed(() => {
  const block = (m: ThemeMode, onlyDiffering: boolean) => {
    const parts: string[] = []
    for (const group of THEME_GROUPS) {
      const lines = group.vars
        .filter((v) => !onlyDiffering || valueOf(v.name, m) !== valueOf(v.name, 'light'))
        .map((v) => `  ${v.name}: ${valueOf(v.name, m)};`)
      if (lines.length) parts.push(`  /* ${group.title} */\n${lines.join('\n')}`)
    }
    return `${selectorFor(m)} {\n${parts.join('\n\n')}\n}`
  }
  return `${block('light', false)}\n\n${block('dark', true)}\n`
})

const copied = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(copyCss.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    copied.value = false
  }
}

// --- color pickers: resolve each color token inside the scheduler to the hex it renders as -------

const stage = useTemplateRef<HTMLElement>('stage')
const resolved = ref<Record<string, string>>({})

function toHex(rgb: string) {
  const m = rgb.match(/[\d.]+/g)
  if (!m || m.length < 3) return '#000000'
  return (
    '#' +
    m
      .slice(0, 3)
      .map((n) => Math.round(+n).toString(16).padStart(2, '0'))
      .join('')
  )
}

async function resolveColors() {
  await nextTick()
  const root = stage.value?.querySelector('.schedvueler')
  if (!root) return
  const probe = document.createElement('span')
  probe.style.display = 'none'
  root.appendChild(probe)
  const out: Record<string, string> = {}
  for (const v of ALL_VARS) {
    if (!isColorVar(v.name)) continue
    probe.style.color = ''
    probe.style.color = `var(${v.name})`
    out[v.name] = toHex(getComputedStyle(probe).color)
  }
  probe.remove()
  resolved.value = out
}

onMounted(resolveColors)
watch([liveCss, mode], resolveColors, { flush: 'post' })
</script>

<template>
  <main class="tp">
    <component :is="'style'">{{ liveCss }}</component>

    <header class="tp__top">
      <nav aria-label="Playground pages">
        <a href="#/">Full playground</a>
        <a href="#/examples">Simple view examples</a>
        <a href="#/parts">Slots and parts</a>
      </nav>
      <h1>Theme</h1>
      <p>
        Every token the stylesheet reads. Change a value and the scheduler follows; copy the sheet
        when it looks right.
      </p>
    </header>

    <div class="tp__body">
      <section class="tp__sheet" aria-labelledby="tp-sheet-heading">
        <div class="tp__bar">
          <h2 id="tp-sheet-heading">CSS</h2>
          <div class="tp__modes" role="group" aria-label="Theme">
            <button
              v-for="m in ['light', 'dark'] as const"
              :key="m"
              type="button"
              :aria-pressed="mode === m"
              :class="{ 'is-active': mode === m }"
              @click="mode = m"
            >
              {{ m }}
            </button>
          </div>
          <button type="button" :disabled="!changedCount" @click="resetAll">
            Reset{{ changedCount ? ` (${changedCount})` : '' }}
          </button>
          <button type="button" class="tp__copy" @click="copy">
            {{ copied ? 'Copied' : 'Copy CSS' }}
          </button>
        </div>

        <div class="tp__code">
          <div class="tp__line tp__sel">{{ selectorFor(mode) }} {</div>
          <template v-for="group in THEME_GROUPS" :key="group.title">
            <div class="tp__line tp__comment">/* {{ group.title }} */</div>
            <div
              v-for="v in group.vars"
              :key="v.name"
              class="tp__line tp__decl"
              :class="{ 'is-changed': isChanged(v.name) }"
            >
              <label :for="`tp-${v.name}`" class="tp__name">{{ v.name }}</label>
              <span class="tp__colon">:</span>
              <input
                v-if="isColorVar(v.name)"
                type="color"
                class="tp__swatch"
                :aria-label="`${v.name} color`"
                :value="resolved[v.name] ?? '#000000'"
                @input="setValue(v.name, ($event.target as HTMLInputElement).value)"
              />
              <input
                :id="`tp-${v.name}`"
                class="tp__value"
                spellcheck="false"
                :value="valueOf(v.name)"
                :title="valueOf(v.name)"
                @input="setValue(v.name, ($event.target as HTMLInputElement).value)"
              />
              <span class="tp__colon">;</span>
              <button
                v-if="isChanged(v.name)"
                type="button"
                class="tp__reset"
                :aria-label="`Reset ${v.name}`"
                :title="`Default: ${defaultOf(v.name)}`"
                @click="reset(v.name)"
              >
                ↺
              </button>
            </div>
          </template>
          <div class="tp__line tp__sel">}</div>
        </div>
      </section>

      <section ref="stage" class="tp__stage" aria-label="Example scheduler">
        <Scheduler
          v-model:date="date"
          v-model:view="view"
          :events="events"
          :resources="resources"
          :theme="mode"
          :week-start="1"
          locale="en-GB"
        >
          <DayView name="day" label="Day" />
          <WeekView name="week" label="Week" />
          <MonthView name="month" label="Month" />
          <TimelineView name="timeline" label="Timeline" />
          <AgendaView name="agenda" label="Agenda" />
        </Scheduler>
      </section>
    </div>
  </main>
</template>

<style scoped>
.tp {
  box-sizing: border-box;
  min-height: 100%;
  padding: 24px clamp(16px, 3vw, 40px);
  color: #17211b;
  background: #f5f7f4;
  font-family: Inter, system-ui, sans-serif;
}

.tp__top nav {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 24px;
  font-size: 14px;
}

.tp a {
  color: #175c43;
  text-underline-offset: 3px;
}

.tp h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 650;
}

.tp__top p {
  margin: 8px 0 20px;
  color: #526057;
}

.tp__body {
  display: grid;
  grid-template-columns: minmax(0, 30rem) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.tp__sheet {
  position: sticky;
  top: 16px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 32px);
  min-width: 0;
  border: 1px solid #d5ddd7;
  border-radius: 6px;
  background: #fff;
}

.tp__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #d5ddd7;
}

.tp__bar h2 {
  margin: 0 auto 0 0;
  font-size: 16px;
}

.tp__bar button {
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid #bac8bf;
  border-radius: 4px;
  color: #175c43;
  background: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.tp__bar button:disabled {
  color: #9aa69e;
  cursor: default;
}

.tp__modes {
  display: flex;
}

.tp__modes button {
  border-radius: 0;
  text-transform: capitalize;
}

.tp__modes button:first-child {
  border-radius: 4px 0 0 4px;
}

.tp__modes button:last-child {
  margin-left: -1px;
  border-radius: 0 4px 4px 0;
}

.tp__bar button.is-active {
  border-color: #175c43;
  background: #e7f1eb;
}

.tp__bar .tp__copy {
  border-color: #175c43;
  color: #fff;
  background: #175c43;
}

.tp__bar button:focus-visible,
.tp__code :focus-visible {
  outline: 2px solid #175c43;
  outline-offset: 1px;
}

.tp__code {
  overflow: auto;
  padding: 10px 0;
  font:
    12.5px/1.5 'Cascadia Code',
    'SFMono-Regular',
    Consolas,
    monospace;
}

.tp__line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 0 12px;
  white-space: nowrap;
}

.tp__sel {
  color: #7c3aed;
}

.tp__comment {
  margin-top: 6px;
  padding-left: 28px;
  color: #8a968e;
}

.tp__decl {
  padding-left: 28px;
}

.tp__decl.is-changed {
  background: #fff7e0;
  box-shadow: inset 3px 0 #d39b0a;
}

.tp__name {
  color: #0e6b8c;
}

.tp__colon {
  color: #8a968e;
}

.tp__swatch {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #bac8bf;
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

.tp__swatch::-webkit-color-swatch-wrapper {
  padding: 0;
}

.tp__swatch::-webkit-color-swatch {
  border: 0;
  border-radius: 3px;
}

.tp__value {
  flex: 1 1 auto;
  min-width: 6rem;
  padding: 2px 4px;
  border: 1px solid transparent;
  border-radius: 3px;
  color: #a1401b;
  background: transparent;
  font: inherit;
}

.tp__value:hover {
  border-color: #d5ddd7;
}

.tp__value:focus {
  border-color: #175c43;
  background: #fff;
}

.tp__reset {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  color: #8a6a07;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
}

.tp__reset:hover {
  background: #f3e3b0;
}

.tp__stage {
  position: sticky;
  top: 16px;
  height: calc(100vh - 32px);
  min-height: 420px;
  min-width: 0;
}

@media (max-width: 900px) {
  .tp__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .tp__sheet,
  .tp__stage {
    position: static;
  }

  .tp__sheet {
    max-height: 60vh;
  }

  .tp__stage {
    order: -1;
    height: 70vh;
  }
}
</style>
