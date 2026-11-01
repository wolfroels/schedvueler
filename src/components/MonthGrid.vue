<script setup lang="ts">
import {
  computed,
  mergeProps,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  Temporal,
  loadPerDay,
  computeSelection,
  formatDate,
  type EventOccurrence,
  type Hit,
  type VisibleRange,
} from '../core'
import { createCancelable, whenAllowed } from '../composables/cancelable'
import { useSchedulerContext } from '../composables/context'
import { useMonthGrid, type MonthCell, type MonthMoreLink } from '../composables/useMonthGrid'
import type { SlotResolver } from '../composables/useSchedulerView'
import EventItem from './EventItem.vue'
import { stableStyle } from './stable-style'
import { isRtl, visualArrow } from './direction'
import { RenderSlot } from './RenderSlot'

const props = defineProps<{
  view: string
  range: VisibleRange
  hiddenDays: readonly number[]
  maxEventRows: number | 'auto'
  /** Below this scheduler width, days show dots instead of event bars. */
  compactWidth: number
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

function isOutOfRange(date: Temporal.PlainDate) {
  const { min, max } = ctx.dateLimits.value
  return (
    (!!min && Temporal.PlainDate.compare(date, min) < 0) ||
    (!!max && Temporal.PlainDate.compare(date, max) > 0)
  )
}

/** Blocked times and background events of a day; closed hours only show as `is-closed`. */
function dayShades(date: Temporal.PlainDate) {
  return ctx.availability.hasShades.value
    ? ctx.availability
        .shadesFor(date, undefined)
        .filter((s) => s.kind === 'blocked' || s.kind === 'background')
    : []
}

/** How busy a day is, from 0 to 4, with `day-utilization`. */
function dayLevel(date: Temporal.PlainDate): number {
  const option = ctx.options.value.raw.dayUtilization
  if (!option) return 0
  const capacity = (option === true ? undefined : option.capacity) ?? 480
  const [load] = loadPerDay(occurrencesOn(date), [date], ctx.options.value.timeZone)
  const ratio = (load?.minutes ?? 0) / capacity
  return ratio === 0 ? 0 : ratio < 0.5 ? 1 : ratio < 0.8 ? 2 : ratio <= 1 ? 3 : 4
}

function cellAttrs(cell: MonthCell) {
  const o = ctx.options.value.raw
  if (!o.slotAttrs) return ctx.part('monthCell', cell)
  const tz = ctx.options.value.timeZone
  return mergeProps(
    ctx.part('monthCell', cell),
    (o.slotAttrs({
      view: props.view,
      date: cell.date,
      start: cell.date.toZonedDateTime({ timeZone: tz }),
      end: cell.date.add({ days: 1 }).toZonedDateTime({ timeZone: tz }),
      allDay: true,
    }) ?? {}) as Record<string, unknown>,
  )
}

type SlotEmit = 'slot-click' | 'slot-dblclick' | 'slot-contextmenu'

function dayRange(date: Temporal.PlainDate) {
  const tz = ctx.options.value.timeZone
  return {
    start: date.toZonedDateTime({ timeZone: tz }),
    end: date.add({ days: 1 }).toZonedDateTime({ timeZone: tz }),
  }
}

function onCell(name: SlotEmit, cell: MonthCell, e: MouseEvent) {
  if (name === 'slot-click' && interaction.placeArmed({ zone: 'month', date: cell.date }, e)) return
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
  ctx.openDate(cell.date, props.view, e)
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
  const fromStart = isRtl(root.value) ? first.right - x : x - first.left
  const col = Math.min(
    week.cells.length - 1,
    Math.max(0, Math.floor((fromStart / first.width) * week.cells.length)),
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

function onCellFocus(cell: MonthCell) {
  focusKey.value = cell.key
  interaction.setCursor({ zone: 'month', date: cell.date })
}

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
  const dayHit = { zone: 'month' as const, date: cell.date }
  if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.target !== e.currentTarget || !interaction.selectable) return
    const times = computeSelection(dayHit, dayHit, {
      timeZone: ctx.options.value.timeZone,
      snapMinutes: 1440,
      defaultDurationMinutes: 60,
    })
    if (times) interaction.setSelection(props.view, times, e)
    return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    if (interaction.dropArmed(dayHit, e)) return
    const sel = interaction.selection.value
    if (selectionAnchor.value && sel && sel.view === props.view) {
      interaction.setSelection(props.view, sel.times, e)
      selectionAnchor.value = undefined
    } else {
      ;(e.currentTarget as HTMLElement).click()
    }
    return
  }
  const move = moves[visualArrow(e.key, e.currentTarget as HTMLElement)]
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

// --- compact mode: dots per day, tap a day for its list -------------------------------------

const compact = computed(() => ctx.width.value > 0 && ctx.width.value < props.compactWidth)

function dots(cell: MonthCell) {
  const list = occurrencesOn(cell.date)
  const accessors = ctx.accessors.value
  return {
    colors: list.slice(0, 3).map((o) => accessors.color(o.event)),
    extra: Math.max(0, list.length - 3),
  }
}

function onCompactCellClick(cell: MonthCell, col: number, e: MouseEvent) {
  onCell('slot-click', cell, e)
  const count = occurrencesOn(cell.date).length
  if (count) openMore({ col, date: cell.date, count }, e)
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
    const cell = element.closest('.orb-month__week')?.querySelectorAll('.orb-month__cell')[more.col]
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

// The list stays current while open; a drag from it needs the grid underneath.
const popoverOccurrences = computed(() => (popover.value ? occurrencesOn(popover.value.date) : []))
watch(
  () => interaction.state.value?.preview,
  (preview) => {
    if (preview) closePopover()
  },
)

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
    v-bind="ctx.part('monthGrid')"
    :class="{ 'orb-month--compact': compact }"
    role="grid"
    :aria-label="ctx.title.value"
    :style="{ '--orb-month-cols': weekdays.length, '--orb-month-rows': maxRows }"
  >
    <div class="orb-month__head" role="row">
      <div
        v-for="wd in weekdays"
        :key="wd.weekday"
        class="orb-month__weekday"
        v-bind="ctx.part('monthWeekday', wd)"
        role="columnheader"
      >
        <RenderSlot :fn="resolve('month-weekday')" :scope="wd">{{ wd.label }}</RenderSlot>
      </div>
    </div>

    <div ref="body" class="orb-month__body" @pointerdown="onEmptyPointerDown">
      <div
        v-for="(week, wi) in weeks"
        :key="week.key"
        :ref="(el) => setWeekEl(el, wi)"
        class="orb-month__week"
        v-bind="ctx.part('monthWeek')"
        role="row"
      >
        <div
          v-for="(cell, ci) in week.cells"
          :key="cell.key"
          class="orb-month__cell"
          v-bind="cellAttrs(cell)"
          :class="{
            'is-today': cell.isToday,
            'is-past': cell.isPast,
            'is-other-month': cell.isOtherMonth,
            'is-weekend': cell.date.dayOfWeek >= 6,
            'is-selected': cell.isSelected,
            'is-closed': ctx.availability.isClosedDay(cell.date),
            'is-out-of-range': isOutOfRange(cell.date),
            [`orb-month__cell--load-${dayLevel(cell.date)}`]: dayLevel(cell.date) > 0,
          }"
          role="gridcell"
          :tabindex="cell.key === activeKey ? 0 : -1"
          :data-date="cell.key"
          :aria-label="cellLabel(cell)"
          :aria-selected="cell.isSelected"
          :aria-current="cell.isToday ? 'date' : undefined"
          @keydown="onCellKeydown($event, cell)"
          @focus="onCellFocus(cell)"
          @click="
            compact ? onCompactCellClick(cell, ci, $event) : onCell('slot-click', cell, $event)
          "
          @dblclick="onCell('slot-dblclick', cell, $event)"
          @contextmenu="onCell('slot-contextmenu', cell, $event)"
        >
          <div
            v-for="shade in dayShades(cell.date)"
            :key="shade.key"
            class="orb-shade"
            :class="`orb-shade--${shade.kind}`"
            v-bind="
              ctx.part(shade.kind === 'blocked' ? 'blockedTime' : 'backgroundEvent', { shade })
            "
            :style="shade.color ? { '--orb-background-event-color': shade.color } : undefined"
            aria-hidden="true"
          >
            <RenderSlot
              :fn="resolve(shade.kind === 'blocked' ? 'blocked-time' : 'background-event')"
              :scope="{
                view,
                date: cell.date,
                resourceId: undefined,
                title: shade.title,
                color: shade.color,
                occurrence: shade.occurrence,
              }"
            >
              <span v-if="shade.title" class="orb-shade__title">{{ shade.title }}</span>
            </RenderSlot>
          </div>
          <span
            v-if="ci === 0 && ctx.options.value.raw.weekNumbers"
            class="orb-week-number orb-week-number--month"
            v-bind="ctx.part('weekNumber', { cell })"
          >
            <RenderSlot
              :fn="resolve('week-number')"
              :scope="{ view, week: cell.date.weekOfYear ?? 0, date: cell.date }"
            >
              {{ cell.date.weekOfYear }}
            </RenderSlot>
          </span>
          <RenderSlot :fn="resolve('month-cell')" :scope="{ view, ...cell }">
            <button
              type="button"
              class="orb-month__daynum"
              v-bind="ctx.part('monthDayNumber', cell)"
              tabindex="-1"
              @click.stop="onDateClick(cell, $event)"
            >
              <RenderSlot :fn="resolve('month-day-number')" :scope="{ view, ...cell }">
                {{ cell.dayNumber }}
              </RenderSlot>
            </button>
            <span v-if="compact" class="orb-month__dots" aria-hidden="true">
              <span
                v-for="(color, di) in dots(cell).colors"
                :key="di"
                class="orb-month__dot"
                :style="color ? { '--orb-event-color': color } : undefined"
              />
              <span v-if="dots(cell).extra" class="orb-month__dot-more"
                >+{{ dots(cell).extra }}</span
              >
            </span>
          </RenderSlot>
        </div>

        <div
          v-if="!compact"
          :ref="(el) => setEventsLayer(el, wi)"
          class="orb-month__events"
          role="gridcell"
        >
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
            :style="
              stableStyle(item, (i) => ({
                gridColumn: `${i.startCol + 1} / ${i.endCol + 1}`,
                gridRow: i.row + 1,
              }))
            "
          />
          <button
            v-for="more in week.more"
            :key="`more-${more.col}`"
            type="button"
            class="orb-month__more"
            v-bind="ctx.part('moreLink', more)"
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
      v-bind="ctx.part('popover')"
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
          occurrences: popoverOccurrences,
          close: closePopover,
        }"
      >
        <div class="orb-popover__header" v-bind="ctx.part('popoverHeader')">
          <span class="orb-popover__title" v-bind="ctx.part('popoverTitle')">{{
            popover.title
          }}</span>
          <button
            type="button"
            class="orb-button orb-button--icon orb-button--ghost"
            v-bind="ctx.part('popoverClose')"
            :aria-label="ctx.options.value.messages.close"
            @click="closePopover"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div class="orb-popover__list" v-bind="ctx.part('popoverList')">
          <EventItem
            v-for="occ in popoverOccurrences"
            :key="occ.key"
            :occurrence="occ"
            variant="list"
            :view="view"
            :resolve="resolve"
            :origin-date="popover.date"
          />
        </div>
      </RenderSlot>
    </div>
  </div>
</template>
