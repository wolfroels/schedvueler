<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  computeSelection,
  formatDate,
  type EventOccurrence,
  type Hit,
  type Temporal,
  type VisibleRange,
} from '../core'
import { createCancelable, whenAllowed } from '../composables/cancelable'
import { useSchedulerContext } from '../composables/context'
import { useMonthGrid, type MonthCell, type MonthMoreLink } from '../composables/useMonthGrid'
import type { SlotResolver } from '../composables/useSchedulerView'
import EventItem from './EventItem.vue'
import { RenderSlot } from './RenderSlot'

const props = defineProps<{
  view: string
  range: VisibleRange
  hiddenDays: readonly number[]
  maxEventRows: number | 'auto'
  resolve: SlotResolver
}>()

const ctx = useSchedulerContext()
const interaction = ctx.interaction

// --- "auto" rows: as many event rows as fit in a week row ---------------------------------------

const root = ref<HTMLElement>()
const firstEventsLayer = ref<HTMLElement>()
const probe = ref<HTMLElement>()
const measuredRows = ref<number>(4)
let observer: ResizeObserver | undefined

function measure() {
  const layer = firstEventsLayer.value
  const row = probe.value
  if (!layer || !row) return
  const gap = parseFloat(getComputedStyle(layer).rowGap) || 0
  const rowHeight = row.offsetHeight
  if (rowHeight <= 0) return
  measuredRows.value = Math.max(1, Math.floor((layer.clientHeight + gap) / (rowHeight + gap)))
}

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(measure)
  if (root.value) observer.observe(root.value)
  measure()
})
onBeforeUnmount(() => observer?.disconnect())

const maxRows = computed(() =>
  props.maxEventRows === 'auto' ? measuredRows.value : Math.max(1, props.maxEventRows),
)

const { weekdays, weeks, occurrencesOn } = useMonthGrid(ctx, () => ({
  range: props.range,
  hiddenDays: props.hiddenDays,
  maxRows: maxRows.value,
}))

function setProbe(el: unknown) {
  probe.value = (el as HTMLElement | null) ?? undefined
}

function setEventsLayer(el: unknown, index: number) {
  if (index === 0) firstEventsLayer.value = (el as HTMLElement | null) ?? undefined
}

// --- interactions ----------------------------------------------------------------------------

type SlotEmit = 'slot-click' | 'slot-dblclick' | 'slot-contextmenu'

function dayRange(date: Temporal.PlainDate) {
  const tz = ctx.options.value.timeZone
  return {
    start: date.toZonedDateTime({ timeZone: tz }),
    end: date.add({ days: 1 }).toZonedDateTime({ timeZone: tz }),
  }
}

function onCell(name: SlotEmit, cell: MonthCell, e: MouseEvent) {
  ctx.emit(name, {
    view: props.view,
    date: cell.date,
    ...dayRange(cell.date),
    allDay: true,
    nativeEvent: e,
    element: e.currentTarget as HTMLElement,
  })
}

function onDateClick(cell: MonthCell, e: MouseEvent) {
  ctx.emit('date-click', {
    view: props.view,
    date: cell.date,
    nativeEvent: e,
    element: e.currentTarget as HTMLElement,
  })
}

/** Pointerdown on empty space starts a selection (when enabled); events handle their own. */
function onEmptyPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.orb-event, .orb-month__more')) return
  interaction.pointerDownOnSlot(e, props.view)
}

function cellLabel(cell: MonthCell) {
  const date = formatDate(cell.date, ctx.options.value.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const count = occurrencesOn(cell.date).length
  return count ? `${date}, ${ctx.options.value.messages.eventCount(count)}` : date
}

// --- hit testing for drag, resize and select ---------------------------------------------------

const body = ref<HTMLElement>()
const weekEls: HTMLElement[] = []

function setWeekEl(el: unknown, index: number) {
  if (el) weekEls[index] = el as HTMLElement
}

function hitTest(x: number, y: number): Hit | null {
  const list = weekEls.slice(0, weeks.value.length)
  if (!list.length || !root.value?.isConnected) return null
  const rects = list.map((w) => w.getBoundingClientRect())
  const first = rects[0]!
  if (x < first.left || x > first.right) return null
  // Above or below the grid counts as the first or last week, so dragging out keeps a target.
  let index = rects.findIndex((r) => y >= r.top && y < r.bottom)
  if (index < 0) index = y < first.top ? 0 : rects.length - 1
  const week = weeks.value[index]!
  const col = Math.min(
    week.cells.length - 1,
    Math.max(0, Math.floor(((x - first.left) / first.width) * week.cells.length)),
  )
  return { zone: 'month', date: week.cells[col]!.date }
}

let unregister: (() => void) | undefined
onMounted(() => {
  unregister = interaction.registerSurface({ hitTest, scrollElement: () => body.value })
})
onBeforeUnmount(() => unregister?.())

// --- keyboard: roving focus over the day cells -----------------------------------------------

const focusKey = shallowRef<string>()
const selectionAnchor = shallowRef<Hit>()
const flatCells = computed(() => weeks.value.flatMap((w) => w.cells))
const activeKey = computed(() => {
  const cells = flatCells.value
  if (focusKey.value && cells.some((c) => c.key === focusKey.value)) return focusKey.value
  return (cells.find((c) => c.isToday) ?? cells.find((c) => !c.isOtherMonth) ?? cells[0])?.key
})

function focusCellKey(key: string) {
  focusKey.value = key
  nextTick(() => root.value?.querySelector<HTMLElement>(`[data-date="${key}"]`)?.focus())
}

function onCellKeydown(e: KeyboardEvent, cell: MonthCell) {
  const cells = flatCells.value
  const cols = weekdays.value.length
  const index = cells.findIndex((c) => c.key === cell.key)
  const moves: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -cols,
    ArrowDown: cols,
  }
  if (e.key === 'Enter' || e.key === ' ') {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const sel = interaction.selection.value
    if (selectionAnchor.value && sel && sel.view === props.view) {
      interaction.setSelection(props.view, sel.times, e)
      selectionAnchor.value = undefined
    } else {
      ;(e.currentTarget as HTMLElement).click()
    }
    return
  }
  const move = moves[e.key]
  if (move === undefined) return
  e.preventDefault()
  const target = index + move
  if (target < 0 || target >= cells.length) {
    // Past the edge: go to the previous or next month and keep the weekday.
    if (target < 0) ctx.prev()
    else ctx.next()
    return
  }
  const next = cells[target]!
  if (e.shiftKey && interaction.selectable) {
    const anchor = selectionAnchor.value ?? { zone: 'month' as const, date: cell.date }
    selectionAnchor.value = anchor
    const times = computeSelection(
      anchor,
      { zone: 'month', date: next.date },
      {
        timeZone: ctx.options.value.timeZone,
        snapMinutes: ctx.options.value.slotDuration,
        defaultDurationMinutes: 60,
      },
    )
    interaction.setSelection(props.view, times)
  } else if (selectionAnchor.value) {
    selectionAnchor.value = undefined
    interaction.clearSelection()
  }
  focusCellKey(next.key)
}

// --- "+N more" popover -----------------------------------------------------------------------

interface PopoverState {
  date: Temporal.PlainDate
  title: string
  occurrences: EventOccurrence<unknown>[]
  style: Record<string, string>
}

const popover = shallowRef<PopoverState>()
const popoverEl = ref<HTMLElement>()
let returnFocus: HTMLElement | undefined

function moreLabel(count: number) {
  return ctx.options.value.messages.more(count)
}

function openMore(more: MonthMoreLink, e: MouseEvent) {
  const element = e.currentTarget as HTMLElement
  const occurrences = occurrencesOn(more.date)
  const { payload, settle } = createCancelable({
    view: props.view,
    date: more.date,
    occurrences,
    hiddenCount: more.count,
    nativeEvent: e,
    element,
  })
  ctx.emit('more-click', payload)
  whenAllowed(settle(), () => {
    const rootRect = root.value!.getBoundingClientRect()
    const cell = element.closest('.orb-month__week')!.querySelectorAll('.orb-month__cell')[more.col]
    const rect = (cell ?? element).getBoundingClientRect()
    const width = Math.max(rect.width + 16, 220)
    const left = Math.min(Math.max(rect.left - rootRect.left - 8, 0), rootRect.width - width)
    const top = Math.max(rect.top - rootRect.top - 8, 0)
    returnFocus = element
    popover.value = {
      date: more.date,
      title: formatDate(more.date, ctx.options.value.locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      occurrences,
      style: { left: `${Math.max(left, 0)}px`, top: `${top}px`, width: `${width}px` },
    }
    nextTick(() => popoverEl.value?.focus())
  })
}

function closePopover() {
  if (!popover.value) return
  popover.value = undefined
  returnFocus?.focus()
}

function onDocumentPointerDown(e: PointerEvent) {
  if (popover.value && !popoverEl.value?.contains(e.target as Node)) closePopover()
}

watch(popover, (open) => {
  if (open) document.addEventListener('pointerdown', onDocumentPointerDown, true)
  else document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
watch(() => props.range, closePopover)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true))
</script>

<template>
  <div
    ref="root"
    class="orb-month"
    role="grid"
    :aria-label="ctx.title.value"
    :style="{ '--orb-month-cols': weekdays.length, '--orb-month-rows': maxRows }"
  >
    <div class="orb-month__head" role="row">
      <div v-for="wd in weekdays" :key="wd.weekday" class="orb-month__weekday" role="columnheader">
        <RenderSlot :fn="resolve('month-weekday')" :scope="wd">{{ wd.label }}</RenderSlot>
      </div>
    </div>

    <div ref="body" class="orb-month__body" @pointerdown="onEmptyPointerDown">
      <div
        v-for="(week, wi) in weeks"
        :key="week.key"
        :ref="(el) => setWeekEl(el, wi)"
        class="orb-month__week"
        role="row"
      >
        <div
          v-for="cell in week.cells"
          :key="cell.key"
          class="orb-month__cell"
          :class="{
            'is-today': cell.isToday,
            'is-past': cell.isPast,
            'is-other-month': cell.isOtherMonth,
            'is-weekend': cell.date.dayOfWeek >= 6,
            'is-selected': cell.isSelected,
          }"
          role="gridcell"
          :tabindex="cell.key === activeKey ? 0 : -1"
          :data-date="cell.key"
          :aria-label="cellLabel(cell)"
          :aria-selected="cell.isSelected"
          :aria-current="cell.isToday ? 'date' : undefined"
          @keydown="onCellKeydown($event, cell)"
          @focus="focusKey = cell.key"
          @click="onCell('slot-click', cell, $event)"
          @dblclick="onCell('slot-dblclick', cell, $event)"
          @contextmenu="onCell('slot-contextmenu', cell, $event)"
        >
          <RenderSlot :fn="resolve('month-cell')" :scope="{ view, ...cell }">
            <button
              type="button"
              class="orb-month__daynum"
              tabindex="-1"
              @click.stop="onDateClick(cell, $event)"
            >
              {{ cell.dayNumber }}
            </button>
          </RenderSlot>
        </div>

        <div :ref="(el) => setEventsLayer(el, wi)" class="orb-month__events">
          <span v-if="wi === 0" :ref="setProbe" class="orb-month__probe" aria-hidden="true" />
          <EventItem
            v-for="item in week.events"
            :key="item.key"
            :occurrence="item.occurrence"
            :variant="item.variant"
            :view="view"
            :resolve="resolve"
            :is-start="item.isStart"
            :is-end="item.isEnd"
            :mirror="item.mirror"
            :valid="interaction.mirror.value?.valid ?? true"
            :style="{
              gridColumn: `${item.startCol + 1} / ${item.endCol + 1}`,
              gridRow: item.row + 1,
            }"
          />
          <button
            v-for="more in week.more"
            :key="`more-${more.col}`"
            type="button"
            class="orb-month__more"
            :style="{ gridColumn: more.col + 1, gridRow: maxRows }"
            @click="openMore(more, $event)"
          >
            <RenderSlot
              :fn="resolve('more-link')"
              :scope="{
                date: more.date,
                count: more.count,
                occurrences: occurrencesOn(more.date),
                label: moreLabel(more.count),
              }"
            >
              {{ moreLabel(more.count) }}
            </RenderSlot>
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="popover"
      ref="popoverEl"
      class="orb-popover"
      role="dialog"
      :aria-label="popover.title"
      tabindex="-1"
      :style="popover.style"
      @keydown.esc.stop="closePopover"
    >
      <RenderSlot
        :fn="resolve('more-popover')"
        :scope="{
          date: popover.date,
          title: popover.title,
          occurrences: popover.occurrences,
          close: closePopover,
        }"
      >
        <div class="orb-popover__header">
          <span class="orb-popover__title">{{ popover.title }}</span>
          <button
            type="button"
            class="orb-button orb-button--icon orb-button--ghost"
            :aria-label="ctx.options.value.messages.close"
            @click="closePopover"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div class="orb-popover__list">
          <EventItem
            v-for="occ in popover.occurrences"
            :key="occ.key"
            :occurrence="occ"
            variant="list"
            :view="view"
            :resolve="resolve"
          />
        </div>
      </RenderSlot>
    </div>
  </div>
</template>
