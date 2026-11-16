<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import {
  Temporal,
  defaultRecurrenceForm,
  formToRecurrence,
  recurrenceScopeOptions,
  recurrenceToForm,
  removeEventOccurrence,
  saveEventEdit,
  type EventFields,
  type EventId,
  type EventOccurrence,
  type EventSave,
  type RecurrenceEditScope,
  type RecurrenceForm,
  type ResourceId,
  type SchedulerEvent,
} from '../core'
import { defaultEditorMessages, type EditorMessages } from '../types'

/**
 * A ready-made dialog to create, edit and delete events, including repeats and the "this /
 * following / all" choice for recurring events. Open it from the scheduler's emits:
 * `@select="editor?.create"` and `@event-dblclick="editor?.edit"`.
 */

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

/** What `create()` takes: the scheduler's `select` payload fits. */
export interface EditorCreateInput {
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  allDay: boolean
  resourceId?: ResourceId
  resourceIds?: readonly ResourceId[]
}

/** What `edit()` takes: any payload with an `occurrence`, such as `event-dblclick`'s. */
export interface EditorEditInput {
  occurrence: EventOccurrence<SchedulerEvent>
}

export interface EditorSavePayload {
  /** `null` for a new event. */
  occurrence: EventOccurrence<SchedulerEvent> | null
  /** The times and fields to save; `saveEventEdit` applies them. */
  edit: EventSave
  scope: RecurrenceEditScope
}

export interface EditorDeletePayload {
  occurrence: EventOccurrence<SchedulerEvent>
  scope: RecurrenceEditScope
}

const props = withDefaults(
  defineProps<{
    /**
     * Your events. With them the editor applies its changes and emits `update:events`, so
     * `v-model:events` or `@update:events="(e, label) => history.commit(e, label)"` is enough.
     */
    events?: readonly SchedulerEvent[]
    /** Zone for the form's dates and times. Default: the zone of what was opened. */
    timeZone?: string
    /** Offered in a resource field when given. A scheduler's `resources` fit. */
    resources?: readonly { id: ResourceId; title?: string }[]
    /** Swatches to choose from; empty hides the color field. */
    colors?: readonly string[]
    messages?: Partial<EditorMessages>
    /** For weekday names. */
    locale?: string
    theme?: 'light' | 'dark' | 'auto'
    preset?: string
    /** Id for new events and for the exceptions and series an edit creates. */
    createId?: (from: SchedulerEvent) => EventId
  }>(),
  {
    theme: 'light',
    preset: 'default',
    colors: () => [
      '#2563eb',
      '#0891b2',
      '#16a34a',
      '#ca8a04',
      '#ea580c',
      '#dc2626',
      '#db2777',
      '#7c3aed',
      '#64748b',
    ],
  },
)

const emit = defineEmits<{
  /** The events after a save or delete, with a label for undo. Only with `events`. */
  'update:events': [events: SchedulerEvent[], label: string]
  /** Before applying: the times and fields. Apply them yourself when you don't pass `events`. */
  save: [payload: EditorSavePayload]
  delete: [payload: EditorDeletePayload]
  close: []
}>()

/** Fields of the event the form does not show; they are written back as they were. */
type Extra = Record<string, unknown>

defineSlots<{
  /** More fields, after the built-in ones. Write to `fields`; they are saved on the event. */
  fields?: (props: { fields: Extra; occurrence: EventOccurrence<SchedulerEvent> | null }) => unknown
}>()

const m = computed<EditorMessages>(() => ({ ...defaultEditorMessages, ...props.messages }))

interface Draft {
  title: string
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  resourceId: ResourceId | ''
  color: string
  repeat: 'none' | Freq
  rule: RecurrenceForm
  extra: Extra
}

const MANAGED = new Set([
  'id',
  'title',
  'start',
  'end',
  'allDay',
  'color',
  'rrule',
  'exdates',
  'rdates',
  'resourceId',
  'resourceIds',
  'recurringEventId',
  'recurrenceId',
  'timezone',
])

const dialog = ref<HTMLDialogElement>()
const draft = ref<Draft>()
const occurrence = ref<EventOccurrence<SchedulerEvent> | null>(null)
/** The rule the form opened with, to tell whether the user changed it. */
let initialRule: string | null = null
let zone = 'UTC'
const step = ref<'save' | 'delete'>()
const headingId = useId()

const isOpen = computed(() => !!draft.value)

const minute = (t: Temporal.PlainTime) => t.toString({ smallestUnit: 'minute' })

function fill(
  start: Temporal.ZonedDateTime,
  end: Temporal.ZonedDateTime,
  allDay: boolean,
  rest: Partial<Draft>,
): Draft {
  const s = start.withTimeZone(zone)
  const e = end.withTimeZone(zone)
  // All-day ends are exclusive; the form shows the last day.
  const lastDay = allDay ? e.toPlainDate().subtract({ days: 1 }) : e.toPlainDate()
  const timed = allDay
    ? { start: Temporal.PlainTime.from('09:00'), end: Temporal.PlainTime.from('10:00') }
    : { start: s.toPlainTime(), end: e.toPlainTime() }
  return {
    title: '',
    color: '',
    resourceId: '',
    repeat: 'none',
    rule: defaultRecurrenceForm(s.toPlainDate()),
    extra: {},
    ...rest,
    allDay,
    startDate: s.toPlainDate().toString(),
    startTime: minute(timed.start),
    endDate: (Temporal.PlainDate.compare(lastDay, s.toPlainDate()) < 0
      ? s.toPlainDate()
      : lastDay
    ).toString(),
    endTime: minute(timed.end),
  }
}

async function show() {
  step.value = undefined
  await nextTick()
  const el = dialog.value
  if (el && !el.open) el.showModal?.()
}

/** Opens the editor for a new event, e.g. with the scheduler's `select` payload. */
function create(input: EditorCreateInput) {
  zone = props.timeZone ?? input.start.timeZoneId
  occurrence.value = null
  initialRule = null
  draft.value = fill(input.start, input.end, input.allDay, {
    resourceId: input.resourceId ?? input.resourceIds?.[0] ?? '',
  })
  void show()
}

/** Opens the editor for an event, e.g. with the scheduler's `event-dblclick` payload. */
function edit(input: EditorEditInput) {
  const occ = input.occurrence
  zone = props.timeZone ?? occ.start.timeZoneId
  occurrence.value = occ
  const event = occ.event
  // An edited occurrence repeats with its series.
  const series =
    occ.isException && occ.seriesId != null
      ? props.events?.find((e) => e.id === occ.seriesId)
      : event
  const rrule = series?.rrule ?? null
  const startDate = occ.start.withTimeZone(zone).toPlainDate()
  let rule = defaultRecurrenceForm(startDate)
  let repeat: Draft['repeat'] = 'none'
  if (rrule) {
    try {
      rule = recurrenceToForm(rrule, startDate)
      repeat = (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).includes(rule.freq as Freq)
        ? (rule.freq as Freq)
        : 'none'
    } catch {
      repeat = 'none'
    }
  }
  initialRule = repeat === 'none' ? null : formToRecurrence(rule)
  const extra: Extra = {}
  for (const [key, value] of Object.entries(event as unknown as Record<string, unknown>)) {
    if (!MANAGED.has(key)) extra[key] = value
  }
  draft.value = fill(occ.start, occ.end, occ.allDay, {
    title: event.title ?? '',
    color: event.color ?? '',
    resourceId: occ.resourceIds[0] ?? '',
    repeat,
    rule,
    extra,
  })
  void show()
}

function close() {
  if (dialog.value?.open) dialog.value.close()
  else onClosed()
}

function onClosed() {
  if (!draft.value) return
  draft.value = undefined
  occurrence.value = null
  step.value = undefined
  emit('close')
}

// A click on the backdrop lands on the dialog itself.
function onDialogClick(e: MouseEvent) {
  if (e.target === dialog.value) close()
}

// --- times ---------------------------------------------------------------------------------

function times(d: Draft): Omit<EventSave, 'fields'> | null {
  try {
    const resourceIds = d.resourceId === '' ? [] : [d.resourceId]
    if (d.allDay) {
      const start = Temporal.PlainDate.from(d.startDate).toZonedDateTime({ timeZone: zone })
      const end = Temporal.PlainDate.from(d.endDate)
        .add({ days: 1 })
        .toZonedDateTime({ timeZone: zone })
      return { start, end, allDay: true, resourceIds }
    }
    const start = Temporal.PlainDateTime.from(`${d.startDate}T${d.startTime}`).toZonedDateTime(zone)
    const end = Temporal.PlainDateTime.from(`${d.endDate}T${d.endTime}`).toZonedDateTime(zone)
    return { start, end, allDay: false, resourceIds }
  } catch {
    return null
  }
}

const current = computed(() => (draft.value ? times(draft.value) : null))
const valid = computed(
  () =>
    !!current.value && Temporal.ZonedDateTime.compare(current.value.end, current.value.start) > 0,
)
const endError = computed(() => !!draft.value && !!current.value && !valid.value)

let lastLength: Temporal.Duration | undefined
function rememberLength() {
  const t = current.value
  lastLength = t ? t.start.until(t.end, { largestUnit: 'hours' }) : undefined
}

/** Moving the start moves the end along, so the length stays. */
function onStartChange() {
  const d = draft.value
  const t = d && times(d)
  if (!d || !t || !lastLength) return rememberLength()
  const end = t.start.add(lastLength).withTimeZone(zone)
  if (d.allDay) d.endDate = end.subtract({ days: 1 }).toPlainDate().toString()
  else {
    d.endDate = end.toPlainDate().toString()
    d.endTime = minute(end.toPlainTime())
  }
  rememberLength()
}

function onAllDayChange() {
  const d = draft.value
  if (!d) return
  if (
    Temporal.PlainDate.compare(
      Temporal.PlainDate.from(d.endDate),
      Temporal.PlainDate.from(d.startDate),
    ) < 0
  )
    d.endDate = d.startDate
  rememberLength()
}

// --- repeat --------------------------------------------------------------------------------

const weekdays = computed(() => {
  const monday = Temporal.PlainDate.from('2024-01-01')
  return [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    day,
    label: monday.add({ days: day - 1 }).toLocaleString(props.locale, { weekday: 'short' }),
  }))
})

function toggleWeekday(day: number) {
  const rule = draft.value?.rule
  if (!rule) return
  const has = rule.weekdays.includes(day)
  if (has && rule.weekdays.length === 1) return
  rule.weekdays = has ? rule.weekdays.filter((d) => d !== day) : [...rule.weekdays, day]
}

function onRepeatChange() {
  const d = draft.value
  if (!d || d.repeat === 'none') return
  d.rule.freq = d.repeat
  if (d.repeat === 'WEEKLY' && !d.rule.weekdays.length)
    d.rule.weekdays = [Temporal.PlainDate.from(d.startDate).dayOfWeek]
}

const unit = computed(() => {
  const d = draft.value
  if (!d || d.repeat === 'none') return ''
  const [one, more] = m.value.units[d.repeat]
  return d.rule.interval === 1 ? one : more
})

function rrule(d: Draft): string | null {
  return d.repeat === 'none' ? null : formToRecurrence({ ...d.rule, freq: d.repeat })
}

// --- save and delete -------------------------------------------------------------------------

/** For undo: "Edit event: Site visit". */
const label = (action: string, title?: string) =>
  title?.trim() ? `${action}: ${title.trim()}` : action

const recurring = computed(() => {
  const occ = occurrence.value
  return !!occ && (occ.recurring || occ.isException)
})

/** "this" cannot carry a new rule, so a changed rule leaves only the series-wide choices. */
const scopeOptions = computed(() => {
  const occ = occurrence.value
  if (!occ) return []
  const words = m.value.scope
  const options = recurrenceScopeOptions(occ, words)
  const d = draft.value
  const ruleChanged = !!d && step.value === 'save' && rrule(d) !== initialRule
  return ruleChanged ? options.filter((o) => o.scope !== 'this') : options
})

function onSave() {
  if (!valid.value || !draft.value) return
  if (recurring.value) step.value = 'save'
  else save('this')
}

function save(scope: RecurrenceEditScope) {
  const d = draft.value
  const t = d && times(d)
  if (!d || !t) return
  const fields: EventFields = { ...d.extra, title: d.title.trim(), color: d.color || undefined }
  const rule = rrule(d)
  if (rule !== initialRule) fields.rrule = rule
  const editing = occurrence.value
  const payload: EditorSavePayload = { occurrence: editing, edit: { ...t, fields }, scope }
  emit('save', payload)
  if (props.events) {
    const next = saveEventEdit(props.events, editing, payload.edit, {
      timeZone: zone,
      scope,
      createId: props.createId,
    })
    emit('update:events', next, label(editing ? m.value.editEvent : m.value.newEvent, d.title))
  }
  close()
}

function onDelete() {
  if (recurring.value) step.value = 'delete'
  else remove('this')
}

function remove(scope: RecurrenceEditScope) {
  const occ = occurrence.value
  if (!occ) return
  emit('delete', { occurrence: occ, scope })
  if (props.events) {
    const next = removeEventOccurrence(props.events, occ, { timeZone: zone, scope })
    emit('update:events', next, label(m.value.delete, occ.event.title))
  }
  close()
}

function choose(scope: RecurrenceEditScope) {
  if (step.value === 'delete') remove(scope)
  else save(scope)
}

defineExpose({ create, edit, close, isOpen })
</script>

<template>
  <dialog
    ref="dialog"
    class="orb-editor"
    data-orb-part="eventEditor"
    :data-theme="theme"
    :data-preset="preset"
    :aria-labelledby="headingId"
    @close="onClosed"
    @click="onDialogClick"
  >
    <form v-if="draft" class="orb-editor__form" novalidate @submit.prevent="onSave">
      <header class="orb-editor__header">
        <h2 :id="headingId" class="orb-editor__heading">
          {{ occurrence ? m.editEvent : m.newEvent }}
        </h2>
        <button
          type="button"
          class="orb-button orb-button--icon orb-button--ghost"
          :aria-label="m.cancel"
          @click="close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>

      <div v-if="!step" class="orb-editor__body">
        <input
          v-model="draft.title"
          class="orb-editor__title"
          type="text"
          autofocus
          :aria-label="m.title"
          :placeholder="m.titlePlaceholder"
        />

        <label class="orb-editor__check">
          <input v-model="draft.allDay" type="checkbox" @change="onAllDayChange" />
          {{ m.allDay }}
        </label>

        <div class="orb-editor__row" role="group" :aria-label="m.start">
          <span class="orb-editor__label">{{ m.start }}</span>
          <input
            v-model="draft.startDate"
            class="orb-editor__input"
            type="date"
            :aria-label="`${m.start}, date`"
            @focus="rememberLength"
            @change="onStartChange"
          />
          <input
            v-if="!draft.allDay"
            v-model="draft.startTime"
            class="orb-editor__input"
            type="time"
            :aria-label="`${m.start}, time`"
            @focus="rememberLength"
            @change="onStartChange"
          />
        </div>
        <div class="orb-editor__row" role="group" :aria-label="m.end">
          <span class="orb-editor__label">{{ m.end }}</span>
          <input
            v-model="draft.endDate"
            class="orb-editor__input"
            type="date"
            :aria-label="`${m.end}, date`"
            :aria-invalid="endError || undefined"
            @change="rememberLength"
          />
          <input
            v-if="!draft.allDay"
            v-model="draft.endTime"
            class="orb-editor__input"
            type="time"
            :aria-label="`${m.end}, time`"
            :aria-invalid="endError || undefined"
            @change="rememberLength"
          />
        </div>
        <p v-if="endError" class="orb-editor__error" role="alert">{{ m.endBeforeStart }}</p>

        <label v-if="resources?.length" class="orb-editor__row">
          <span class="orb-editor__label">{{ m.resource }}</span>
          <select v-model="draft.resourceId" class="orb-editor__input">
            <option value="">{{ m.noResource }}</option>
            <option v-for="r in resources" :key="r.id" :value="r.id">{{ r.title ?? r.id }}</option>
          </select>
        </label>

        <div v-if="colors.length" class="orb-editor__row">
          <span class="orb-editor__label">{{ m.color }}</span>
          <div class="orb-editor__swatches" role="radiogroup" :aria-label="m.color">
            <button
              type="button"
              role="radio"
              class="orb-editor__swatch orb-editor__swatch--none"
              :aria-checked="!draft.color"
              :aria-label="m.defaultColor"
              @click="draft.color = ''"
            />
            <button
              v-for="c in colors"
              :key="c"
              type="button"
              role="radio"
              class="orb-editor__swatch"
              :style="{ '--swatch': c }"
              :aria-checked="draft.color === c"
              :aria-label="c"
              @click="draft.color = c"
            />
          </div>
        </div>

        <label class="orb-editor__row">
          <span class="orb-editor__label">{{ m.repeat }}</span>
          <select v-model="draft.repeat" class="orb-editor__input" @change="onRepeatChange">
            <option value="none">{{ m.doesNotRepeat }}</option>
            <option v-for="(label, freq) in m.frequencies" :key="freq" :value="freq">
              {{ label }}
            </option>
          </select>
        </label>

        <template v-if="draft.repeat !== 'none'">
          <div class="orb-editor__row">
            <span class="orb-editor__label">{{ m.every }}</span>
            <input
              v-model.number="draft.rule.interval"
              class="orb-editor__input orb-editor__input--number"
              type="number"
              min="1"
              :aria-label="m.every"
            />
            <span class="orb-editor__unit">{{ unit }}</span>
          </div>
          <div v-if="draft.repeat === 'WEEKLY'" class="orb-editor__row">
            <span class="orb-editor__label">{{ m.onDays }}</span>
            <div class="orb-editor__weekdays" role="group" :aria-label="m.onDays">
              <button
                v-for="w in weekdays"
                :key="w.day"
                type="button"
                class="orb-editor__weekday"
                :aria-pressed="draft.rule.weekdays.includes(w.day)"
                @click="toggleWeekday(w.day)"
              >
                {{ w.label }}
              </button>
            </div>
          </div>
          <div class="orb-editor__row">
            <span class="orb-editor__label">{{ m.repeatEnds }}</span>
            <select
              v-model="draft.rule.endType"
              class="orb-editor__input"
              :aria-label="m.repeatEnds"
            >
              <option value="never">{{ m.never }}</option>
              <option value="count">{{ m.afterCount }}</option>
              <option value="until">{{ m.onDate }}</option>
            </select>
            <template v-if="draft.rule.endType === 'count'">
              <input
                v-model.number="draft.rule.count"
                class="orb-editor__input orb-editor__input--number"
                type="number"
                min="1"
                :aria-label="m.occurrences"
              />
              <span class="orb-editor__unit">{{ m.occurrences }}</span>
            </template>
            <input
              v-if="draft.rule.endType === 'until'"
              v-model="draft.rule.until"
              class="orb-editor__input"
              type="date"
              :aria-label="m.onDate"
            />
          </div>
        </template>

        <slot name="fields" :fields="draft.extra" :occurrence="occurrence" />
      </div>

      <div v-else class="orb-editor__body orb-editor__scope">
        <p class="orb-editor__question">{{ step === 'delete' ? m.deleteWhich : m.saveWhich }}</p>
        <button
          v-for="option in scopeOptions"
          :key="option.scope"
          type="button"
          class="orb-editor__choice"
          :data-scope="option.scope"
          @click="choose(option.scope)"
        >
          <span>{{ option.label }}</span>
          <small>{{ option.description }}</small>
        </button>
      </div>

      <footer class="orb-editor__footer">
        <template v-if="!step">
          <button
            v-if="occurrence"
            type="button"
            class="orb-button orb-button--ghost orb-editor__delete"
            @click="onDelete"
          >
            {{ m.delete }}
          </button>
          <span class="orb-editor__spacer" />
          <button type="button" class="orb-button" @click="close">{{ m.cancel }}</button>
          <button type="submit" class="orb-button orb-button--primary" :disabled="!valid">
            {{ m.save }}
          </button>
        </template>
        <template v-else>
          <span class="orb-editor__spacer" />
          <button type="button" class="orb-button" @click="step = undefined">{{ m.back }}</button>
        </template>
      </footer>
    </form>
  </dialog>
</template>
