<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import {
  Scheduler,
  SchedulerLegend,
  SchedulerMiniCalendar,
  SchedulerQuickAdd,
  SchedulerUndoToast,
  Temporal,
  WeekView,
  useCalendars,
  useCommands,
  useDraft,
  useHistory,
  useRecurrenceScope,
  applyEventEdit,
  type SchedulerEvent,
} from '../../src'

// The components and composables that live next to the scheduler.
const log: string[] = []
Object.assign(window, { orbLog: log })

const events = shallowRef<SchedulerEvent[]>([
  {
    id: 'a',
    title: 'Alpha',
    start: '2026-06-15T09:00:00',
    end: '2026-06-15T10:00:00',
    calendar: 'work',
  } as SchedulerEvent,
  {
    id: 'b',
    title: 'Beta',
    start: '2026-06-16T09:00:00',
    end: '2026-06-16T10:00:00',
    calendar: 'home',
  } as SchedulerEvent,
  {
    id: 'r',
    title: 'Repeat',
    start: '2026-06-17T11:00:00',
    end: '2026-06-17T12:00:00',
    rrule: 'FREQ=DAILY;COUNT=2',
  },
])
const date = ref('2026-06-15')
const history = useHistory(events)

const calendars = useCalendars(
  events,
  [
    { id: 'work', label: 'Work', color: '#2563eb' },
    { id: 'home', label: 'Home', color: '#16a34a' },
  ],
  (e) => (e as SchedulerEvent & { calendar?: string }).calendar,
)

const draft = useDraft(events)
const scope = useRecurrenceScope<SchedulerEvent>()
const scheduler = ref<{ context: never }>()
const commands = shallowRef<ReturnType<typeof useCommands>>()
watch(scheduler, (s) => {
  if (s) commands.value = useCommands(s.context)
})
const query = ref('')

function edit(p: Parameters<typeof applyEventEdit>[2] & { occurrence: never; scope: 'this' }) {
  log.push(`scope ${p.scope}`)
  history.commit(
    applyEventEdit(events.value, p.occurrence, p, { scope: p.scope, timeZone: 'Europe/Brussels' }),
    'Move event',
  )
}

function move() {
  draft.begin()
  draft.set(
    draft.visible.value.map((e) =>
      e.id === 'a' ? { ...e, start: '2026-06-15T13:00:00', end: '2026-06-15T14:00:00' } : e,
    ),
  )
}

const added = ref('')
const today = Temporal.PlainDate.from('2026-06-15')
</script>

<template>
  <SchedulerMiniCalendar
    v-model:date="date"
    :events="events"
    locale="en-GB"
    time-zone="Europe/Brussels"
    :week-start="1"
  />
  <SchedulerLegend :layers="calendars.layers.value" @toggle="calendars.toggle" />
  <SchedulerQuickAdd
    :today="today"
    locale="en-GB"
    @add="(r) => (added = `${r.title}|${r.start}|${r.durationMinutes}`)"
  />
  <output class="added">{{ added }}</output>
  <SchedulerUndoToast :history="history" />
  <button type="button" class="draft-move" @click="move">Try a change</button>
  <input v-model="query" class="palette" />
  <ul class="palette-results">
    <li v-for="c in commands?.search(query)" :key="c.id">
      <button type="button" @click="c.run()">{{ c.label }}</button>
    </li>
  </ul>
  <dialog v-if="scope.request.value" open class="scope">
    <button
      v-for="o in scope.options.value"
      :key="o.scope"
      type="button"
      @click="scope.answer(o.scope)"
    >
      {{ o.label }}
    </button>
    <button type="button" @click="scope.answer(null)">Cancel</button>
  </dialog>
  <div style="height: 560px">
    <Scheduler
      ref="scheduler"
      v-model:date="date"
      :events="draft.isActive.value ? draft.visible.value : calendars.events.value"
      time-zone="Europe/Brussels"
      locale="en-GB"
      :week-start="1"
      scroll-time="07:00"
      :now-indicator="false"
      editable
      :event-attrs="draft.attrs"
      :draft="
        draft.count.value
          ? { count: draft.count.value, apply: draft.apply, discard: draft.discard }
          : undefined
      "
      @before-event-drop="scope.confirm"
      @event-drop="edit as never"
    >
      <WeekView />
    </Scheduler>
  </div>
</template>
