<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { isChanged, type Setting, type SettingGroup } from './settings'

// Renders every setting of `groups` with a control, its explanation and a reset button.
const props = defineProps<{
  groups: SettingGroup[]
  /** Control values by group id, then by key. */
  values: Record<string, Record<string, unknown>>
  /** "Copy as code" text. */
  code: string
}>()

const emit = defineEmits<{
  set: [group: string, key: string, value: unknown]
  reset: [group: string | null, key?: string]
}>()

const query = shallowRef('')
const changedOnly = shallowRef(false)
const copied = shallowRef(false)

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const kebab = (key: string) =>
  key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

const valueOf = (group: string, s: Setting) => props.values[group]?.[s.key] ?? s.initial
const changed = (group: string, s: Setting) =>
  s.control.kind !== 'code' && isChanged(s, valueOf(group, s))

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.groups
    .map((g) => ({
      ...g,
      settings: g.settings.filter(
        (s) =>
          (!q || kebab(s.key).includes(q) || s.help.toLowerCase().includes(q)) &&
          (!changedOnly.value || changed(g.id, s)),
      ),
    }))
    .filter((g) => g.settings.length)
})

const changedCount = computed(() =>
  props.groups.reduce((n, g) => n + g.settings.filter((s) => changed(g.id, s)).length, 0),
)
const groupChanged = (g: SettingGroup) => g.settings.filter((s) => changed(g.id, s)).length

function toggleDay(group: string, s: Setting, day: number) {
  const days = (valueOf(group, s) as number[]) ?? []
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
  emit('set', group, s.key, next)
}

function onNumber(group: string, s: Setting, raw: string) {
  const n = Number(raw)
  if (raw !== '' && Number.isFinite(n)) emit('set', group, s.key, n)
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard refused (no permission): the text is selectable below.
  }
}
</script>

<template>
  <div class="pg-settings">
    <div class="pg-settings__bar">
      <input
        v-model="query"
        class="pg-settings__search"
        type="search"
        placeholder="Find a setting"
        aria-label="Find a setting"
      />
    </div>
    <div class="pg-settings__bar">
      <label class="pg-settings__only">
        <input v-model="changedOnly" type="checkbox" /> Changed only
        <span v-if="changedCount" class="pg-settings__count">{{ changedCount }}</span>
      </label>
      <button type="button" class="pg__btn" :disabled="!changedCount" @click="emit('reset', null)">
        Reset all
      </button>
    </div>

    <details
      v-for="g in visible"
      :key="g.id"
      class="pg-settings__group"
      :open="!!query.trim() || changedOnly || undefined"
    >
      <summary>
        {{ g.title }}
        <span v-if="groupChanged(g)" class="pg-settings__count">{{ groupChanged(g) }}</span>
      </summary>
      <div
        v-for="s in g.settings"
        :key="s.key"
        class="pg-setting"
        :class="{ 'is-changed': changed(g.id, s) }"
        :data-setting="s.key"
      >
        <div class="pg-setting__head">
          <span class="pg-setting__name" :title="s.help">{{ kebab(s.key) }}</span>
          <button
            v-if="changed(g.id, s)"
            type="button"
            class="pg-setting__reset"
            :aria-label="`Reset ${kebab(s.key)}`"
            title="Reset"
            @click="emit('reset', g.id, s.key)"
          >
            ↺
          </button>
          <!-- Controls by kind -->
          <input
            v-if="s.control.kind === 'boolean'"
            type="checkbox"
            class="pg-setting__check"
            :checked="!!valueOf(g.id, s)"
            :aria-label="kebab(s.key)"
            @change="emit('set', g.id, s.key, ($event.target as HTMLInputElement).checked)"
          />
        </div>
        <select
          v-if="s.control.kind === 'choice'"
          :value="valueOf(g.id, s)"
          :aria-label="kebab(s.key)"
          @change="emit('set', g.id, s.key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="o in s.control.options" :key="o.label" :value="o.label">
            {{ o.label }}
          </option>
        </select>
        <input
          v-else-if="s.control.kind === 'number'"
          type="number"
          :min="s.control.min"
          :max="s.control.max"
          :step="s.control.step"
          :value="valueOf(g.id, s)"
          :aria-label="kebab(s.key)"
          @change="onNumber(g.id, s, ($event.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="s.control.kind === 'text'"
          type="text"
          :placeholder="s.control.placeholder"
          :value="valueOf(g.id, s)"
          :aria-label="kebab(s.key)"
          @change="emit('set', g.id, s.key, ($event.target as HTMLInputElement).value.trim())"
        />
        <div
          v-else-if="s.control.kind === 'days'"
          class="pg-setting__days"
          role="group"
          :aria-label="kebab(s.key)"
        >
          <button
            v-for="(d, i) in WEEKDAYS"
            :key="d"
            type="button"
            :aria-pressed="((valueOf(g.id, s) as number[]) ?? []).includes(i + 1)"
            @click="toggleDay(g.id, s, i + 1)"
          >
            {{ d }}
          </button>
        </div>
        <input
          v-else-if="s.control.kind === 'color'"
          type="color"
          :value="valueOf(g.id, s)"
          :aria-label="kebab(s.key)"
          @input="emit('set', g.id, s.key, ($event.target as HTMLInputElement).value)"
        />
        <div v-else-if="s.control.kind === 'range'" class="pg-setting__range">
          <input
            type="range"
            :min="s.control.min"
            :max="s.control.max"
            :value="valueOf(g.id, s)"
            :aria-label="kebab(s.key)"
            @input="emit('set', g.id, s.key, Number(($event.target as HTMLInputElement).value))"
          />
          <span>{{ valueOf(g.id, s) }}{{ s.control.unit }}</span>
        </div>
        <p v-else-if="s.control.kind === 'code'" class="pg-setting__note">{{ s.control.note }}</p>
        <p class="pg-setting__help">{{ s.help }}</p>
      </div>
    </details>
    <p v-if="!visible.length" class="pg__hint">No setting matches.</p>

    <details class="pg-settings__group">
      <summary>Copy as code</summary>
      <p class="pg__hint">The attributes that differ from the library's defaults.</p>
      <pre class="pg-settings__code">{{ code }}</pre>
      <button type="button" class="pg__btn" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
    </details>
  </div>
</template>

<style>
.pg-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pg-settings__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pg-settings__search {
  flex: 1;
  height: var(--pg-control-height);
  padding: 0 8px;
  border: 1px solid var(--pg-line);
  border-radius: 6px;
  background: var(--pg-control);
  color: inherit;
  font: inherit;
}

.pg-settings__only {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pg-settings__count {
  min-width: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--pg-accent);
  color: #fff;
  font-size: 0.6875rem;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.pg-settings__group {
  border-top: 1px solid var(--pg-line);
}

.pg-settings__group > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  font-weight: 500;
  cursor: pointer;
  list-style-position: inside;
}

.pg-setting {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0 8px 8px;
  border-left: 2px solid transparent;
}

.pg-setting.is-changed {
  border-left-color: var(--pg-accent);
}

.pg-setting__head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pg-setting__name {
  flex: 1;
  overflow: hidden;
  font-family: var(--pg-mono);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pg-setting__check {
  width: 16px;
  height: 16px;
  margin: 0;
}

.pg-setting__reset {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--pg-muted);
  cursor: pointer;
}

.pg-setting__reset:hover {
  background: var(--pg-hover);
  color: var(--pg-text);
}

/* Wider than the sidebar's own selects, so long example names fit. */
.pg__sidebar .pg-setting select,
.pg__sidebar .pg-setting input[type='number'],
.pg__sidebar .pg-setting input[type='text'] {
  width: 100%;
  height: var(--pg-control-height);
  padding: 0 8px;
  border: 1px solid var(--pg-line);
  border-radius: 6px;
  background-color: var(--pg-control);
  color: inherit;
  font: inherit;
}

.pg-setting__days {
  display: flex;
  gap: 2px;
}

.pg-setting__days button {
  flex: 1;
  height: 26px;
  padding: 0;
  border: 1px solid var(--pg-line);
  border-radius: 4px;
  background: var(--pg-control);
  color: var(--pg-text-2);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.pg-setting__days button[aria-pressed='true'] {
  border-color: transparent;
  background: var(--pg-accent);
  color: #fff;
}

.pg-setting__range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pg-setting__range input {
  flex: 1;
}

.pg-setting__range span {
  min-width: 3rem;
  color: var(--pg-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.pg-setting__help,
.pg-setting__note {
  margin: 0;
  color: var(--pg-muted);
  font-size: 0.75rem;
}

.pg-setting__note {
  color: var(--pg-text-2);
}

.pg-settings__code {
  max-height: 16rem;
  margin: 8px 0;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--pg-line);
  border-radius: 6px;
  background: var(--pg-control);
  font-family: var(--pg-mono);
  font-size: 0.6875rem;
  white-space: pre;
  user-select: all;
}
</style>
