import type { SchedulerPart } from '../src'

export type AnatomyView = 'week' | 'rooms' | 'month' | 'year' | 'agenda' | 'timeline'

export const VIEWS: { name: AnatomyView; label: string }[] = [
  { name: 'week', label: 'Week' },
  { name: 'rooms', label: 'Resource columns' },
  { name: 'month', label: 'Month' },
  { name: 'year', label: 'Year' },
  { name: 'agenda', label: 'Agenda' },
  { name: 'timeline', label: 'Timeline' },
]

const ALL: AnatomyView[] = VIEWS.map((v) => v.name)
const GRID: AnatomyView[] = ['week', 'rooms']
const EVENTS: AnatomyView[] = ['week', 'rooms', 'month', 'agenda', 'timeline']

export interface PartInfo {
  name: SchedulerPart
  group: string
  description: string
  /** Default class, for styling with plain CSS. */
  className: string
  views: AnatomyView[]
  /** What a `pt` function receives. */
  scope?: string
  /** Only appears after doing something. */
  hint?: string
}

const part = (
  name: SchedulerPart,
  group: string,
  className: string,
  description: string,
  views: AnatomyView[],
  extra: Pick<PartInfo, 'scope' | 'hint'> = {},
): PartInfo => ({ name, group, className, description, views, ...extra })

export const PARTS: PartInfo[] = [
  part(
    'conflict',
    'Events',
    'orb-event__conflict',
    'Marks an event that overlaps another.',
    EVENTS,
    { hint: 'Needs show-conflicts.' },
  ),
  part('dragTooltip', 'Events', 'orb-drag-tooltip', 'Next to the pointer while dragging.', EVENTS, {
    hint: 'Needs drag-tooltip.',
  }),
  part('draftBar', 'Scheduler', 'orb-draft-bar', 'The bar for changes to apply.', ALL, {
    hint: 'Needs draft.',
  }),
  part(
    'eventBuffer',
    'Events',
    'orb-event__buffer',
    'Setup or cleanup around an event.',
    ['week', 'rooms', 'timeline'],
    { hint: 'Needs bufferBefore or bufferAfter on an event.' },
  ),
  part('zoomControl', 'Timeline', 'orb-tl__zoom', 'Zooms a timeline.', ['timeline'], {
    hint: 'Needs zoom-levels.',
  }),
  part('minimap', 'Timeline', 'orb-tl__minimap', 'An overview of the whole range.', ['timeline'], {
    hint: 'Needs minimap.',
  }),
  part('eventStack', 'Events', 'orb-event-stack', 'Overlapping events taken together.', GRID, {
    hint: 'Needs event-stack-threshold.',
  }),
  part('timeFold', 'Time grid', 'orb-tg__fold', 'A stretch without events.', GRID, {
    hint: 'Needs fold-empty-hours.',
  }),
  part('presence', 'Events', 'orb-event__presence', 'Who has an event open.', EVENTS, {
    hint: 'Needs presence.',
  }),
  part('suggestion', 'Availability', 'orb-shade--suggestion', 'A suggested time.', GRID, {
    hint: 'Needs suggestions.',
  }),
  part('timeZoneBand', 'Availability', 'orb-shade--band', 'Hours that suit all zones.', GRID, {
    hint: 'Needs overlap-zones.',
  }),
  part(
    'multiMonth',
    'Month',
    'orb-multi-month',
    'Several month grids, in MultiMonthView.',
    ['month'],
    { hint: 'Needs MultiMonthView.' },
  ),
  part(
    'multiMonthTitle',
    'Month',
    'orb-multi-month__title',
    'The name above each month.',
    ['month'],
    { hint: 'Needs MultiMonthView.' },
  ),
  part('yearPlanner', 'Year', 'orb-planner', 'The linear plan of the year.', ['year'], {
    hint: 'Needs display="planner".',
  }),
  part('yearPlannerRow', 'Year', 'orb-planner__row', 'A month in the plan.', ['year'], {
    hint: 'Needs display="planner".',
  }),
  part('weekNumber', 'Scheduler', 'orb-week-number', 'A week number.', ['week', 'month', 'year'], {
    hint: 'Needs week-numbers.',
  }),
  part('zoneLabel', 'Time grid', 'orb-tg__zone-label', 'The time in another zone.', GRID, {
    hint: 'Needs extra-time-zones.',
  }),
  part('viewMenu', 'Toolbar', 'orb-toolbar__view-menu', 'The menu for more views.', ALL, {
    hint: 'Needs max-view-buttons.',
  }),
  part('titlePicker', 'Toolbar', 'orb-toolbar__title-button', 'The title as a date picker.', ALL, {
    hint: 'Needs title-date-picker.',
  }),
  part('loading', 'Scheduler', 'schedvueler__overlay', 'Over the view while loading.', ALL, {
    hint: 'Needs loading.',
  }),
  part('empty', 'Scheduler', 'schedvueler__overlay--empty', 'Over a range without events.', ALL, {
    hint: 'Needs the empty slot.',
  }),
  part(
    'error',
    'Scheduler',
    'schedvueler__overlay--error',
    'Over the view after an error.',
    ALL,
    { hint: 'Needs error.' },
  ),
  part('timelineTier', 'Timeline', 'orb-tl__tier', 'A cell above the days.', ['timeline'], {
    hint: 'Needs header-tiers.',
  }),
  part(
    'resourceSearch',
    'Timeline',
    'orb-tl__search',
    'The search box above the resources.',
    ['timeline'],
    { hint: 'Needs resource-search.' },
  ),
  part(
    'resourceCell',
    'Timeline',
    'orb-tl__resource-cell',
    'A cell of a resource column.',
    ['timeline'],
    { hint: 'Needs resource-columns.' },
  ),
  part(
    'resourceResizer',
    'Timeline',
    'orb-tl__resizer',
    'Resizes the resource area.',
    ['timeline'],
    { hint: 'Needs resource-area-resizable.' },
  ),
  part('resourceLoad', 'Timeline', 'orb-tl__load', 'How busy a row is on a day.', ['timeline'], {
    hint: 'Needs load.',
  }),
  part('dayCount', 'Timeline', 'orb-tl__count', 'The number of events on a day.', ['timeline'], {
    hint: 'Needs day-events="count".',
  }),
  part(
    'dependency',
    'Timeline',
    'orb-tl__dependencies',
    'An arrow between two events.',
    ['timeline'],
    { hint: 'Needs dependencies.' },
  ),
  part(
    'eventProgress',
    'Events',
    'orb-event__progress',
    'How far along an event is.',
    ['timeline'],
    { hint: 'Needs an event with progress.' },
  ),
  part('marquee', 'Events', 'orb-marquee', 'The rectangle drawn with Shift + drag.', EVENTS, {
    hint: 'Needs event-selection.',
  }),
  part(
    'closedTime',
    'Availability',
    'orb-shade--closed',
    'Hours outside business hours.',
    ['week', 'rooms', 'timeline'],
    {
      scope: '{ shade, column | resource }',
      hint: 'Needs business-hours.',
    },
  ),
  part(
    'blockedTime',
    'Availability',
    'orb-shade--blocked',
    'A blocked time.',
    ['week', 'rooms', 'month', 'timeline'],
    {
      scope: '{ shade, column | resource }',
      hint: 'Needs blocked-times.',
    },
  ),
  part(
    'backgroundEvent',
    'Availability',
    'orb-shade--background',
    'An event with display: background.',
    ['week', 'rooms', 'month', 'timeline'],
    {
      scope: '{ shade, column | resource }',
      hint: 'Needs a background event.',
    },
  ),
  part(
    'hiddenIndicator',
    'Availability',
    'orb-tg__hidden',
    'Marks events outside the visible hours.',
    GRID,
    {
      scope: '{ column, direction }',
      hint: 'Needs limited visible hours.',
    },
  ),
  part('root', 'Scheduler', 'schedvueler', 'The whole scheduler.', ALL),
  part('body', 'Scheduler', 'schedvueler__body', 'Holds the active view.', ALL),
  part('toolbar', 'Toolbar', 'orb-toolbar', 'The bar above the view.', ALL),
  part('toolbarStart', 'Toolbar', 'orb-toolbar__section--start', 'Left section.', ALL),
  part('toolbarCenter', 'Toolbar', 'orb-toolbar__section--center', 'Middle section.', ALL),
  part('toolbarEnd', 'Toolbar', 'orb-toolbar__section--end', 'Right section.', ALL),
  part('prevButton', 'Toolbar', 'orb-button', 'Previous period.', ALL),
  part('nextButton', 'Toolbar', 'orb-button', 'Next period.', ALL),
  part('todayButton', 'Toolbar', 'orb-button', 'Go to today.', ALL),
  part('title', 'Toolbar', 'orb-toolbar__title', 'The visible period.', ALL),
  part('viewSwitcher', 'Toolbar', 'orb-segmented', 'The group of view buttons.', ALL),
  part('viewButton', 'Toolbar', 'orb-segmented__item', 'One view button.', ALL, {
    scope: '{ view }',
  }),

  part('event', 'Events', 'orb-event', 'An event, in every view.', EVENTS, {
    scope: '{ occurrence, variant, mirror }',
  }),
  part('eventTitle', 'Events', 'orb-event__title', 'The title inside an event.', EVENTS),
  part('eventTime', 'Events', 'orb-event__time', 'The time inside an event.', EVENTS),
  part('eventDot', 'Events', 'orb-event__dot', 'The color dot of list-style events.', [
    'month',
    'agenda',
  ]),
  part(
    'resizer',
    'Events',
    'orb-event__resizer',
    'A resize handle. Editable events only.',
    ['week', 'rooms', 'timeline'],
    { scope: '{ edge }' },
  ),
  part(
    'selection',
    'Events',
    'orb-tg__selection',
    'The range being selected.',
    ['week', 'rooms', 'timeline'],
    {
      hint: 'Drag over empty slots and hold, or select with Shift + arrows.',
    },
  ),
  part(
    'nowIndicator',
    'Events',
    'orb-tg__now',
    'The current-time line.',
    ['week', 'rooms', 'timeline'],
    {
      hint: 'Only while today is visible.',
    },
  ),

  part('timeGrid', 'Time grid', 'orb-tg', 'The whole time grid.', GRID),
  part('gridHead', 'Time grid', 'orb-tg__head', 'Sticky day headers and all-day row.', GRID),
  part('dayHeader', 'Time grid', 'orb-tg__day-header', 'A day above its column.', GRID, {
    scope: '{ column }',
  }),
  part(
    'resourceHeader',
    'Time grid',
    'orb-tg__resource-header',
    'A resource above its columns.',
    ['rooms'],
    {
      scope: '{ column }',
    },
  ),
  part('allDayLabel', 'Time grid', 'orb-tg__allday-label', 'The label of the all-day row.', GRID),
  part('allDayRow', 'Time grid', 'orb-tg__allday', 'The row of all-day events.', GRID),
  part('allDayCell', 'Time grid', 'orb-tg__allday-cell', 'One day in the all-day row.', GRID, {
    scope: '{ column }',
  }),
  part('gutter', 'Time grid', 'orb-tg__gutter', 'The column of times.', GRID),
  part('timeLabel', 'Time grid', 'orb-tg__time-label', 'One row of the gutter.', GRID, {
    scope: '{ minute }',
  }),
  part('column', 'Time grid', 'orb-tg__column', 'A day (or day and resource) column.', GRID, {
    scope: '{ column }',
  }),
  part('timeSlot', 'Time grid', 'orb-tg__slot', 'One time cell.', GRID, {
    scope: '{ column, minute }',
  }),

  part('monthGrid', 'Month', 'orb-month', 'The whole month grid.', ['month']),
  part('monthWeekday', 'Month', 'orb-month__weekday', 'A weekday heading.', ['month'], {
    scope: '{ weekday, label }',
  }),
  part('monthWeek', 'Month', 'orb-month__week', 'A row of days.', ['month']),
  part('monthCell', 'Month', 'orb-month__cell', 'One day.', ['month'], {
    scope: '{ date, isToday, isPast, isOtherMonth, ... }',
  }),
  part('monthDayNumber', 'Month', 'orb-month__daynum', 'The day number button.', ['month'], {
    scope: '{ date, isToday, ... }',
  }),
  part('moreLink', 'Month', 'orb-month__more', 'The "+N more" link.', ['month'], {
    scope: '{ col, date, count }',
  }),
  part('popover', 'Month', 'orb-popover', 'The "+N more" list.', ['month'], {
    hint: 'Click a "+N more" link to open it.',
  }),
  part('popoverHeader', 'Month', 'orb-popover__header', 'Top of the list.', ['month'], {
    hint: 'Click a "+N more" link to open it.',
  }),
  part('popoverTitle', 'Month', 'orb-popover__title', 'The date in the list.', ['month'], {
    hint: 'Click a "+N more" link to open it.',
  }),
  part('popoverClose', 'Month', 'orb-button', 'Closes the list.', ['month'], {
    hint: 'Click a "+N more" link to open it.',
  }),
  part('popoverList', 'Month', 'orb-popover__list', 'The events in the list.', ['month'], {
    hint: 'Click a "+N more" link to open it.',
  }),

  part('year', 'Year', 'orb-year', 'The whole year view.', ['year']),
  part('yearMonth', 'Year', 'orb-year__month', 'One small month.', ['year'], {
    scope: '{ date, label, cells }',
  }),
  part('yearMonthTitle', 'Year', 'orb-year__month-title', 'A month name.', ['year'], {
    scope: '{ date, label, cells }',
  }),
  part('yearWeekday', 'Year', 'orb-year__weekday', 'A weekday letter.', ['year'], {
    scope: '{ weekday, label }',
  }),
  part('yearDay', 'Year', 'orb-year__day', 'One day.', ['year'], {
    scope: '{ date, level, occurrences, ... }',
  }),

  part('agenda', 'Agenda', 'orb-agenda', 'The whole agenda.', ['agenda']),
  part(
    'agendaEmpty',
    'Agenda',
    'orb-agenda__empty',
    'Shown when there are no events.',
    ['agenda'],
    {
      hint: 'Only in a period without events.',
    },
  ),
  part('agendaDay', 'Agenda', 'orb-agenda__day', 'A day heading row.', ['agenda'], {
    scope: '{ date, label, isToday, count }',
  }),
  part(
    'agendaDayButton',
    'Agenda',
    'orb-agenda__day-button',
    'The date button in that row.',
    ['agenda'],
    {
      scope: '{ date, label, isToday, count }',
    },
  ),
  part('agendaRow', 'Agenda', 'orb-agenda__row', 'The row around an event.', ['agenda'], {
    scope: '{ segment }',
  }),

  part('timeline', 'Timeline', 'orb-tl', 'The whole timeline.', ['timeline']),
  part('timelineCorner', 'Timeline', 'orb-tl__corner', 'Above the resource column.', ['timeline']),
  part(
    'timelineDayHeading',
    'Timeline',
    'orb-tl__day-heading',
    'A day above the time axis.',
    ['timeline'],
    {
      scope: '{ day }',
    },
  ),
  part(
    'timelineSlotHeading',
    'Timeline',
    'orb-tl__slot-heading',
    'A time on the axis.',
    ['timeline'],
    {
      scope: '{ day, slot }',
    },
  ),
  part('timelineRow', 'Timeline', 'orb-tl__row', 'A resource row.', ['timeline'], {
    scope: '{ resource }',
  }),
  part('resourceLabel', 'Timeline', 'orb-tl__label', 'The resource name in a row.', ['timeline'], {
    scope: '{ resource }',
  }),
  part('resourceToggle', 'Timeline', 'orb-tl__toggle', 'Opens or closes a group.', ['timeline'], {
    scope: '{ resource }',
  }),
  part(
    'timelineLane',
    'Timeline',
    'orb-tl__lane',
    'The area holding the events of a row.',
    ['timeline'],
    {
      scope: '{ resource }',
    },
  ),
]

export interface SlotInfo {
  name: string
  group: string
  /** The part this slot renders into or replaces. */
  part: SchedulerPart
  /** `replaces`: the slot takes the place of the part. `inside`: the part stays, its content changes. */
  mode: 'replaces' | 'inside'
  description: string
  props: string
  views: AnatomyView[]
  /** More specific slots that win over this one. */
  overriddenBy?: string[]
  /** Falls back to these when not given. */
  fallsBackTo?: string[]
  hint?: string
}

const EVENT_PROPS =
  'occurrence, event, title, timeText, view, variant, allDay, isStart, isEnd, isPast, color, resourceId, isMirror, valid'
const TOOLBAR_PROPS = 'title, view, views, prev(), next(), today(), setView(name)'

export const SLOTS: SlotInfo[] = [
  {
    name: 'conflict-badge',
    group: 'Events',
    part: 'conflict',
    mode: 'inside',
    description: 'Marks an event that overlaps another.',
    props: 'occurrence, others',
    views: EVENTS,
    hint: 'Needs show-conflicts.',
  },
  {
    name: 'drag-tooltip',
    group: 'Events',
    part: 'dragTooltip',
    mode: 'inside',
    description: 'Next to the pointer while dragging.',
    props: 'occurrence, start, end, allDay, timeText, minutes, valid, reason, conflicts',
    views: EVENTS,
    hint: 'Needs drag-tooltip.',
  },
  {
    name: 'draft-bar',
    group: 'Scheduler',
    part: 'draftBar',
    mode: 'inside',
    description: 'The bar for changes to apply.',
    props: 'count, apply(), discard()',
    views: ALL,
    hint: 'Needs draft.',
  },
  {
    name: 'event-buffer',
    group: 'Events',
    part: 'eventBuffer',
    mode: 'inside',
    description: 'Setup or cleanup around an event.',
    props: 'occurrence, side, minutes',
    views: ['week', 'rooms', 'timeline'],
    hint: 'Needs a buffer on an event.',
  },
  {
    name: 'zoom-control',
    group: 'Timeline',
    part: 'zoomControl',
    mode: 'inside',
    description: 'Zooms a timeline.',
    props: 'level, levels, setLevel(level)',
    views: ['timeline'],
    hint: 'Needs zoom-levels.',
  },
  {
    name: 'minimap',
    group: 'Timeline',
    part: 'minimap',
    mode: 'inside',
    description: 'An overview of the whole range.',
    props: 'days, from, to, scrollTo(fraction)',
    views: ['timeline'],
    hint: 'Needs minimap.',
  },
  {
    name: 'event-stack',
    group: 'Events',
    part: 'eventStack',
    mode: 'inside',
    description: 'Overlapping events taken together.',
    props: 'occurrences, count, label, expand()',
    views: GRID,
    hint: 'Needs event-stack-threshold.',
  },
  {
    name: 'time-fold',
    group: 'Time grid',
    part: 'timeFold',
    mode: 'replaces',
    description: 'A stretch without events.',
    props: 'view, start, end, label',
    views: GRID,
    hint: 'Needs fold-empty-hours.',
  },
  {
    name: 'event-progress',
    group: 'Events',
    part: 'event',
    mode: 'inside',
    description: 'How far along a running event is.',
    props: 'occurrence, progress',
    views: EVENTS,
    hint: 'Needs live-progress and a running event.',
  },
  {
    name: 'presence',
    group: 'Events',
    part: 'presence',
    mode: 'inside',
    description: 'Who has an event open.',
    props: 'occurrence, people',
    views: EVENTS,
    hint: 'Needs presence.',
  },
  {
    name: 'suggestion',
    group: 'Availability',
    part: 'suggestion',
    mode: 'inside',
    description: 'A suggested time.',
    props: 'view, date, resourceId, title, color, occurrence',
    views: GRID,
    hint: 'Needs suggestions.',
  },
  {
    name: 'time-zone-band',
    group: 'Availability',
    part: 'timeZoneBand',
    mode: 'inside',
    description: 'Hours that suit all zones.',
    props: 'view, date, resourceId, title, color, occurrence',
    views: GRID,
    hint: 'Needs overlap-zones.',
  },
  {
    name: 'week-number',
    group: 'Scheduler',
    part: 'weekNumber',
    mode: 'inside',
    description: 'A week number.',
    props: 'view, week, date',
    views: ['week', 'month', 'year'],
    hint: 'Needs week-numbers.',
  },
  {
    name: 'loading',
    group: 'Scheduler',
    part: 'loading',
    mode: 'inside',
    description: 'Over the view while loading.',
    props: 'view, label',
    views: ALL,
    hint: 'Needs loading.',
  },
  {
    name: 'empty',
    group: 'Scheduler',
    part: 'empty',
    mode: 'inside',
    description: 'Over a range without events.',
    props: 'view, label',
    views: ALL,
    hint: 'Only appears in an empty range.',
  },
  {
    name: 'error',
    group: 'Scheduler',
    part: 'error',
    mode: 'inside',
    description: 'Over the view after an error.',
    props: 'view, error',
    views: ALL,
    hint: 'Needs error.',
  },
  {
    name: 'timeline-tier',
    group: 'Timeline',
    part: 'timelineTier',
    mode: 'inside',
    description: 'A cell above the days.',
    props: 'view, unit, date, label',
    views: ['timeline'],
    hint: 'Needs header-tiers.',
  },
  {
    name: 'resource-column',
    group: 'Timeline',
    part: 'resourceCell',
    mode: 'inside',
    description: 'A cell of a resource column.',
    props: 'view, column, resource, value',
    views: ['timeline'],
    hint: 'Needs resource-columns.',
  },
  {
    name: 'resource-load',
    group: 'Timeline',
    part: 'resourceLoad',
    mode: 'inside',
    description: 'How busy a row is on a day.',
    props: 'view, date, resource, minutes, capacity, ratio, occurrences',
    views: ['timeline'],
    hint: 'Needs load.',
  },
  {
    name: 'day-count',
    group: 'Timeline',
    part: 'dayCount',
    mode: 'inside',
    description: 'The number of events on a day.',
    props: 'view, date, resourceId, count, occurrences',
    views: ['timeline'],
    hint: 'Needs day-events="count".',
  },
  {
    name: 'closed-time',
    group: 'Availability',
    part: 'closedTime',
    mode: 'inside',
    description: 'Inside a stretch outside business hours.',
    props: 'view, date, resourceId, title, color, occurrence',
    views: ['week', 'rooms', 'timeline'],
    hint: 'Needs business-hours.',
  },
  {
    name: 'blocked-time',
    group: 'Availability',
    part: 'blockedTime',
    mode: 'inside',
    description: 'Inside a blocked time.',
    props: 'view, date, resourceId, title, color, occurrence',
    views: ['week', 'rooms', 'month', 'timeline'],
    hint: 'Needs blocked-times.',
  },
  {
    name: 'background-event',
    group: 'Availability',
    part: 'backgroundEvent',
    mode: 'inside',
    description: 'Inside a background event.',
    props: 'view, date, resourceId, title, color, occurrence',
    views: ['week', 'rooms', 'month', 'timeline'],
    hint: 'Needs a background event.',
  },
  {
    name: 'hidden-events',
    group: 'Availability',
    part: 'hiddenIndicator',
    mode: 'inside',
    description: 'The marker for events outside the visible hours.',
    props: 'view, date, direction, count, occurrences, label',
    views: GRID,
    hint: 'Needs limited visible hours.',
  },
  {
    name: 'toolbar',
    group: 'Toolbar',
    part: 'toolbar',
    mode: 'replaces',
    description: 'The whole toolbar.',
    props: TOOLBAR_PROPS,
    views: ALL,
  },
  {
    name: 'toolbar-start',
    group: 'Toolbar',
    part: 'toolbarStart',
    mode: 'inside',
    description: 'Left section: navigation and today.',
    props: TOOLBAR_PROPS,
    views: ALL,
  },
  {
    name: 'toolbar-center',
    group: 'Toolbar',
    part: 'toolbarCenter',
    mode: 'inside',
    description: 'Middle section: the title.',
    props: TOOLBAR_PROPS,
    views: ALL,
  },
  {
    name: 'toolbar-end',
    group: 'Toolbar',
    part: 'toolbarEnd',
    mode: 'inside',
    description: 'Right section: the view switcher.',
    props: TOOLBAR_PROPS,
    views: ALL,
  },
  {
    name: 'title',
    group: 'Toolbar',
    part: 'title',
    mode: 'inside',
    description: 'The text of the title.',
    props: TOOLBAR_PROPS,
    views: ALL,
  },
  {
    name: 'nav-prev',
    group: 'Toolbar',
    part: 'prevButton',
    mode: 'replaces',
    description: 'The previous button.',
    props: 'prev(), label',
    views: ALL,
  },
  {
    name: 'nav-next',
    group: 'Toolbar',
    part: 'nextButton',
    mode: 'replaces',
    description: 'The next button.',
    props: 'next(), label',
    views: ALL,
  },
  {
    name: 'today-button',
    group: 'Toolbar',
    part: 'todayButton',
    mode: 'replaces',
    description: 'The today button.',
    props: 'today(), label',
    views: ALL,
  },
  {
    name: 'view-switcher',
    group: 'Toolbar',
    part: 'viewSwitcher',
    mode: 'replaces',
    description: 'The whole view switcher, e.g. a dropdown.',
    props: TOOLBAR_PROPS,
    views: ALL,
  },
  {
    name: 'view-button',
    group: 'Toolbar',
    part: 'viewButton',
    mode: 'replaces',
    description: 'One button of the switcher.',
    props: 'view, setView(name)',
    views: ALL,
  },

  {
    name: 'event',
    group: 'Events',
    part: 'event',
    mode: 'inside',
    description: 'Every event, unless a more specific slot is given.',
    props: EVENT_PROPS,
    views: EVENTS,
    overriddenBy: ['time-event', 'all-day-event', 'month-event', 'agenda-event', 'timeline-event'],
  },
  {
    name: 'event-content',
    group: 'Events',
    part: 'event',
    mode: 'inside',
    description:
      'The default chip keeps its look; only the text inside changes. Used when no event slot applies.',
    props: EVENT_PROPS,
    views: EVENTS,
    overriddenBy: ['event'],
  },
  {
    name: 'time-event',
    group: 'Events',
    part: 'event',
    mode: 'inside',
    description: 'Timed events in a time grid.',
    props: EVENT_PROPS,
    views: GRID,
    fallsBackTo: ['event'],
  },
  {
    name: 'all-day-event',
    group: 'Events',
    part: 'event',
    mode: 'inside',
    description: 'Events in the all-day row.',
    props: EVENT_PROPS,
    views: GRID,
    fallsBackTo: ['event'],
  },
  {
    name: 'month-event',
    group: 'Events',
    part: 'event',
    mode: 'inside',
    description: 'Events in the month grid.',
    props: EVENT_PROPS,
    views: ['month'],
    fallsBackTo: ['event'],
  },
  {
    name: 'agenda-event',
    group: 'Events',
    part: 'event',
    mode: 'inside',
    description: 'Events in the agenda.',
    props: EVENT_PROPS,
    views: ['agenda'],
    fallsBackTo: ['event'],
  },
  {
    name: 'timeline-event',
    group: 'Events',
    part: 'event',
    mode: 'inside',
    description: 'Events on the timeline.',
    props: EVENT_PROPS,
    views: ['timeline'],
    fallsBackTo: ['event'],
  },
  {
    name: 'drag-preview',
    group: 'Events',
    part: 'event',
    mode: 'inside',
    description: 'The preview during a drag.',
    props: EVENT_PROPS,
    views: ['week', 'rooms', 'month', 'timeline'],
    fallsBackTo: ['time-event', 'event'],
    hint: 'Drag an event to see it.',
  },
  {
    name: 'resize-handle',
    group: 'Events',
    part: 'resizer',
    mode: 'inside',
    description: 'The inside of a resize handle, e.g. a grip icon.',
    props: 'edge, variant',
    views: ['week', 'rooms', 'timeline'],
  },
  {
    name: 'selection',
    group: 'Events',
    part: 'selection',
    mode: 'inside',
    description: 'The inside of the selected range, e.g. its length.',
    props: 'view, start, end, allDay, resourceId',
    views: ['week', 'rooms', 'timeline'],
    hint: 'Drag over empty slots and hold.',
  },
  {
    name: 'now-indicator',
    group: 'Events',
    part: 'nowIndicator',
    mode: 'inside',
    description: 'Added to the current-time line, e.g. the time.',
    props: 'now, label',
    views: ['week', 'rooms', 'timeline'],
    hint: 'Only while today is visible.',
  },

  {
    name: 'day-header',
    group: 'Time grid',
    part: 'dayHeader',
    mode: 'inside',
    description: 'A day above its column.',
    props: 'date, view, isToday, weekday, dayNumber',
    views: GRID,
  },
  {
    name: 'all-day-label',
    group: 'Time grid',
    part: 'allDayLabel',
    mode: 'inside',
    description: 'The label of the all-day row.',
    props: 'label',
    views: GRID,
  },
  {
    name: 'time-label',
    group: 'Time grid',
    part: 'timeLabel',
    mode: 'inside',
    description: 'A time in the gutter.',
    props: 'minute, label',
    views: GRID,
  },
  {
    name: 'time-slot',
    group: 'Time grid',
    part: 'timeSlot',
    mode: 'inside',
    description: 'Rendered in every time cell. Keep it light.',
    props: 'view, date, start, end, isToday, resourceId',
    views: GRID,
  },
  {
    name: 'resource-label',
    group: 'Time grid',
    part: 'resourceHeader',
    mode: 'inside',
    description: 'A resource heading. On a timeline it is the name in the row.',
    props: 'view, resource, title, depth, expanded, hasChildren, toggle()',
    views: ['rooms', 'timeline'],
  },

  {
    name: 'month-weekday',
    group: 'Month',
    part: 'monthWeekday',
    mode: 'inside',
    description: 'A weekday heading.',
    props: 'weekday, label',
    views: ['month'],
  },
  {
    name: 'month-cell',
    group: 'Month',
    part: 'monthCell',
    mode: 'inside',
    description: 'The content of a day (behind the events).',
    props: 'view, date, dayNumber, isToday, isOtherMonth, isPast',
    views: ['month'],
  },
  {
    name: 'month-day-number',
    group: 'Month',
    part: 'monthDayNumber',
    mode: 'inside',
    description: 'The day number, without replacing the whole cell.',
    props: 'view, date, dayNumber, isToday, isOtherMonth, isPast',
    views: ['month'],
  },
  {
    name: 'more-link',
    group: 'Month',
    part: 'moreLink',
    mode: 'inside',
    description: 'The text of the "+N more" link.',
    props: 'date, count, occurrences, label',
    views: ['month'],
  },
  {
    name: 'more-popover',
    group: 'Month',
    part: 'popover',
    mode: 'inside',
    description: 'The content of the "+N more" list.',
    props: 'date, title, occurrences, close()',
    views: ['month'],
    hint: 'Click a "+N more" link to open it.',
  },

  {
    name: 'year-month-header',
    group: 'Year',
    part: 'yearMonthTitle',
    mode: 'inside',
    description: 'A month name.',
    props: 'view, date, label',
    views: ['year'],
  },
  {
    name: 'year-day',
    group: 'Year',
    part: 'yearDay',
    mode: 'inside',
    description: 'A day.',
    props: 'view, date, dayNumber, isToday, count, occurrences, level',
    views: ['year'],
  },

  {
    name: 'agenda-day-header',
    group: 'Agenda',
    part: 'agendaDay',
    mode: 'inside',
    description: 'A day heading.',
    props: 'view, date, label, isToday, count',
    views: ['agenda'],
  },
  {
    name: 'agenda-empty',
    group: 'Agenda',
    part: 'agendaEmpty',
    mode: 'inside',
    description: 'The message without events.',
    props: 'view, label',
    views: ['agenda'],
    hint: 'Only in a period without events.',
  },

  {
    name: 'timeline-header',
    group: 'Timeline',
    part: 'timelineSlotHeading',
    mode: 'inside',
    description: 'Day and time headings.',
    props: 'view, date, minute, label, isToday',
    views: ['timeline'],
  },
  {
    name: 'resource-area-header',
    group: 'Timeline',
    part: 'timelineCorner',
    mode: 'inside',
    description: 'Above the resource column.',
    props: 'view, label',
    views: ['timeline'],
  },
]
