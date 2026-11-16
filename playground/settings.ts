import { Temporal, type SchedulerEvent, type SchedulerPreset } from '../src'
import { de, es, fr, nl } from '../src/locales'

// Every <Scheduler> option and view prop, described once. The settings panel renders a control
// for each, the playground binds the values, and "Copy as code" writes out what differs from the
// library's defaults. Options that take a function or an object get a few named examples.

export interface Option {
  label: string
  value: unknown
}

export type Control =
  | { kind: 'boolean' }
  | { kind: 'number'; min?: number; max?: number; step?: number }
  | { kind: 'text'; placeholder?: string }
  /** Named choices; the value is stored by its label, so functions survive a reload. */
  | { kind: 'choice'; options: Option[] }
  /** ISO weekdays. */
  | { kind: 'days' }
  | { kind: 'color' }
  | { kind: 'range'; min: number; max: number; unit: string }
  /** Only in code: shown with a note. */
  | { kind: 'code'; note: string }

export interface Setting {
  /** The prop, camelCase; for `css` settings the custom property. */
  key: string
  help: string
  control: Control
  /** The playground's starting value (a label for choices). */
  initial: unknown
  /** The library's default, for "Copy as code"; `undefined` means "not set". */
  libraryDefault?: unknown
  /** Applied as a CSS variable on the scheduler instead of a prop. */
  css?: boolean
}

export interface SettingGroup {
  id: string
  title: string
  settings: Setting[]
}

// --- helpers ---------------------------------------------------------------------------------

const today = Temporal.Now.plainDateISO()
const monday = today.subtract({ days: today.dayOfWeek - 1 })
const at = (days: number, time: string) => `${monday.add({ days })}T${time}`
const NONE = 'None'

const choice = (labels: [string, unknown][]): Control => ({
  kind: 'choice',
  options: labels.map(([label, value]) => ({ label, value })),
})
const yesNoDefault = (fallback: string): Control =>
  choice([
    [fallback, undefined],
    ['On', true],
    ['Off', false],
  ])

const zones = ['Europe/Brussels', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney', 'UTC']

type Occ = { event: SchedulerEvent; startMs: number; endMs: number }
type DayInfo = { start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime; allDay: boolean }

const isWeekend = (info: { start: Temporal.ZonedDateTime }) => info.start.dayOfWeek >= 6
const inPast = (info: { start: Temporal.ZonedDateTime }) =>
  info.start.epochMilliseconds < Date.now()

/** Every day of ±60 days, 12:00 to 13:00: a lunch break nobody can book. */
const lunchBreaks = Array.from({ length: 121 }, (_, i) => {
  const day = today.add({ days: i - 60 })
  return { start: `${day}T12:00`, end: `${day}T13:00`, title: 'Lunch break' }
})

// --- the scheduler ---------------------------------------------------------------------------

export const schedulerGroups: SettingGroup[] = [
  {
    id: 'time',
    title: 'Time and language',
    settings: [
      {
        key: 'timeZone',
        help: 'Display zone (IANA). Every time is shown in it.',
        control: choice(zones.map((z) => [z, z])),
        initial: 'Europe/Brussels',
      },
      {
        key: 'eventTimeZone',
        help: 'Zone for event times without an offset or their own `timezone`.',
        control: choice([
          ['Same as time zone', undefined],
          ...zones.map((z): [string, unknown] => [z, z]),
        ]),
        initial: 'Same as time zone',
        libraryDefault: undefined,
      },
      {
        key: 'locale',
        help: 'BCP 47 locale for dates, times and weekday names.',
        control: choice(
          ['en-GB', 'en-US', 'nl-BE', 'fr-BE', 'de-DE', 'es-ES', 'ja-JP', 'ar-EG'].map((l) => [
            l,
            l,
          ]),
        ),
        initial: 'en-GB',
      },
      {
        key: 'messages',
        help: 'All texts, including screen-reader announcements. These are the locale packs.',
        control: choice([
          ['English', undefined],
          ['Nederlands', nl.messages],
          ['Français', fr.messages],
          ['Deutsch', de.messages],
          ['Español', es.messages],
        ]),
        initial: 'English',
      },
      {
        key: 'calendar',
        help: 'Months and dates of another calendar in the month, multi-month and year views.',
        control: choice([
          ['Gregorian', undefined],
          ['Persian', 'persian'],
          ['Hebrew', 'hebrew'],
          ['Islamic (Umm al-Qura)', 'islamic-umalqura'],
          ['Japanese', 'japanese'],
        ]),
        initial: 'Gregorian',
      },
      {
        key: 'weekStart',
        help: 'Weekday the week starts on.',
        control: choice([
          ["Locale's", undefined],
          ['Monday', 1],
          ['Saturday', 6],
          ['Sunday', 7],
        ]),
        initial: "Locale's",
      },
      {
        key: 'hour12',
        help: 'Force a 12- or 24-hour clock.',
        control: choice([
          ["Locale's", undefined],
          ['12-hour', true],
          ['24-hour', false],
        ]),
        initial: "Locale's",
      },
      {
        key: 'hiddenDays',
        help: 'Weekdays to leave out of every view.',
        control: { kind: 'days' },
        initial: [],
        libraryDefault: [],
      },
      {
        key: 'workDays',
        help: 'Weekdays of views with `work-week`.',
        control: { kind: 'days' },
        initial: [1, 2, 3, 4, 5],
        libraryDefault: [1, 2, 3, 4, 5],
      },
      {
        key: 'weekNumbers',
        help: 'ISO week numbers in month, week and year views.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'extraTimeZones',
        help: 'More zones next to the times in time grids.',
        control: choice([
          [NONE, undefined],
          ['New York', ['America/New_York']],
          ['New York and Tokyo', ['America/New_York', 'Asia/Tokyo']],
        ]),
        initial: NONE,
      },
      {
        key: 'overlapZones',
        help: 'Marks hours that are working hours in all these zones.',
        control: choice([
          [NONE, undefined],
          [
            'Brussels and New York, 9 to 17',
            [
              { timeZone: 'Europe/Brussels', start: '09:00', end: '17:00' },
              { timeZone: 'America/New_York', start: '09:00', end: '17:00' },
            ],
          ],
        ]),
        initial: NONE,
      },
    ],
  },
  {
    id: 'grid',
    title: 'Grid and hours',
    settings: [
      {
        key: 'slotDuration',
        help: 'Minutes per time-grid slot.',
        control: choice([10, 15, 20, 30, 60].map((n) => [`${n} min`, n])),
        initial: '30 min',
        libraryDefault: 30,
      },
      {
        key: 'slotLabelInterval',
        help: 'Minutes between time labels.',
        control: choice([30, 60, 120].map((n) => [`${n} min`, n])),
        initial: '60 min',
        libraryDefault: 60,
      },
      {
        key: 'snapDuration',
        help: 'Minutes that drags and selections snap to.',
        control: choice([
          ['Slot duration', undefined],
          ...[5, 15, 30, 60].map((n): [string, unknown] => [`${n} min`, n]),
        ]),
        initial: 'Slot duration',
      },
      {
        key: 'dayStartTime',
        help: 'First visible hour of time grids, "HH:mm".',
        control: { kind: 'text', placeholder: '00:00' },
        initial: '00:00',
        libraryDefault: '00:00',
      },
      {
        key: 'dayEndTime',
        help: 'Last visible hour, "HH:mm"; "30:00" runs into the next morning.',
        control: { kind: 'text', placeholder: '24:00' },
        initial: '24:00',
        libraryDefault: '24:00',
      },
      {
        key: 'scrollTime',
        help: 'Time scrolled into view when a time grid opens.',
        control: { kind: 'text', placeholder: '08:00' },
        initial: '08:00',
        libraryDefault: '08:00',
      },
      {
        key: 'defaultEventDuration',
        help: 'Minutes for timed events without an end.',
        control: { kind: 'number', min: 5, max: 600, step: 5 },
        initial: 60,
        libraryDefault: 60,
      },
      {
        key: 'eventLayout',
        help: 'How overlapping events share a day.',
        control: choice([
          ['Columns', 'columns'],
          ['Stack', 'stack'],
        ]),
        initial: 'Columns',
        libraryDefault: 'columns',
      },
      {
        key: 'eventOrder',
        help: 'Order of events within a day.',
        control: choice([
          ['All-day first, then start', undefined],
          [
            'By title',
            (a: Occ, b: Occ) => (a.event.title ?? '').localeCompare(b.event.title ?? ''),
          ],
          ['Longest first', (a: Occ, b: Occ) => b.endMs - b.startMs - (a.endMs - a.startMs)],
        ]),
        initial: 'All-day first, then start',
      },
      {
        key: 'monthEventOrder',
        help: 'Order of events in month rows.',
        control: choice([
          ['Same as event order', undefined],
          [
            'By title',
            (a: Occ, b: Occ) => (a.event.title ?? '').localeCompare(b.event.title ?? ''),
          ],
        ]),
        initial: 'Same as event order',
      },
      {
        key: 'nowIndicator',
        help: 'Line at the current time.',
        control: { kind: 'boolean' },
        initial: true,
        libraryDefault: true,
      },
      {
        key: 'density',
        help: 'Slot height, font size and control height together.',
        control: choice([
          ['Compact', 'compact'],
          ['Normal', 'normal'],
          ['Comfortable', 'comfortable'],
        ]),
        initial: 'Normal',
        libraryDefault: 'normal',
      },
    ],
  },
  {
    id: 'editing',
    title: 'Editing',
    settings: [
      {
        key: 'editable',
        help: 'Drag and resize events.',
        control: { kind: 'boolean' },
        initial: true,
        libraryDefault: false,
      },
      {
        key: 'eventDraggable',
        help: 'Override `editable` for moving.',
        control: yesNoDefault('Follows editable'),
        initial: 'Follows editable',
      },
      {
        key: 'eventResizable',
        help: 'Override `editable` for resizing.',
        control: yesNoDefault('Follows editable'),
        initial: 'Follows editable',
      },
      {
        key: 'selectable',
        help: 'Select a range by dragging over empty slots (opens the editor here).',
        control: { kind: 'boolean' },
        initial: true,
        libraryDefault: false,
      },
      {
        key: 'eventSelection',
        help: 'Click, Ctrl + click and Shift + click select events; changing one changes them all.',
        control: { kind: 'boolean' },
        initial: true,
        libraryDefault: false,
      },
      {
        key: 'eventClipboard',
        help: 'Ctrl + C, X and V copy, cut and paste events.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'dragToDuplicate',
        help: 'Ctrl + drag makes a copy.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'clickToMove',
        help: 'Click an event, then a slot, to move it without dragging.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'dragTooltip',
        help: 'Time, length and conflicts next to the pointer while dragging.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'eventLeave',
        help: 'Dragging an event off the scheduler emits `event-leave`.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'nativeDrop',
        help: 'Native HTML5 drops (files, links) emit `native-drop`.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'multiResourceDrag',
        help: 'How an event on several resources moves between rows.',
        control: choice([
          ['One resource', 'one'],
          ['All together', 'all'],
        ]),
        initial: 'One resource',
        libraryDefault: 'one',
      },
      {
        key: 'dropOnGroups',
        help: 'Events can go on resource group rows such as Crews.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'recurrenceEditScope',
        help: 'Which occurrences a drag of a recurring event changes.',
        control: choice([
          ['This event', 'this'],
          ['This and following', 'following'],
          ['All events', 'all'],
        ]),
        initial: 'This event',
        libraryDefault: 'this',
      },
      {
        key: 'longPressDelay',
        help: 'Touch: milliseconds to press before a drag starts.',
        control: { kind: 'number', min: 100, max: 2000, step: 50 },
        initial: 400,
        libraryDefault: 400,
      },
      {
        key: 'swipeNavigation',
        help: 'Touch: swipe left or right to change period.',
        control: { kind: 'boolean' },
        initial: true,
        libraryDefault: true,
      },
      {
        key: 'draft',
        help: 'A bar with changes to apply or discard (see `useDraft`). Here a fixed example.',
        control: choice([
          [NONE, undefined],
          ['Three pending changes', 'draft-demo'],
        ]),
        initial: NONE,
      },
    ],
  },
  {
    id: 'rules',
    title: 'Rules and availability',
    settings: [
      {
        key: 'businessHours',
        help: 'Opening hours; everything else is shaded.',
        control: choice([
          [NONE, undefined],
          ['Weekdays 9 to 17', { start: '09:00', end: '17:00' }],
          [
            'Weekdays 8 to 18, Saturday 9 to 12',
            [
              { start: '08:00', end: '18:00' },
              { days: [6], start: '09:00', end: '12:00' },
            ],
          ],
        ]),
        initial: NONE,
      },
      {
        key: 'businessHoursOnly',
        help: 'Refuse changes outside business hours.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'blockedTimes',
        help: 'Drawn, and nothing can be placed there.',
        control: choice([
          [NONE, undefined],
          ['Lunch break every day', lunchBreaks],
          [
            'Tower crane 1 in maintenance on Wednesday',
            [
              {
                start: at(2, '00:00'),
                end: at(3, '00:00'),
                resourceId: 'cranes-1',
                title: 'Maintenance',
              },
            ],
          ],
        ]),
        initial: NONE,
      },
      {
        key: 'isSlotDisabled',
        help: 'Refuses ranges by your own rule.',
        control: choice([
          [NONE, undefined],
          ['Weekends', isWeekend],
          ['The past', inPast],
        ]),
        initial: NONE,
      },
      {
        key: 'minDate',
        help: 'Earliest date to navigate to and edit, inclusive.',
        control: choice([
          [NONE, undefined],
          ['Today', today.toString()],
          ['30 days ago', today.subtract({ days: 30 }).toString()],
        ]),
        initial: NONE,
      },
      {
        key: 'maxDate',
        help: 'Latest date to navigate to and edit, inclusive.',
        control: choice([
          [NONE, undefined],
          ['In 30 days', today.add({ days: 30 }).toString()],
          ['In 90 days', today.add({ days: 90 }).toString()],
        ]),
        initial: NONE,
      },
      {
        key: 'eventOverlap',
        help: 'Whether events may overlap on a resource.',
        control: choice([
          ['Allow', 'allow'],
          ['Forbid', 'forbid'],
          [
            'Only with Lunch',
            (info: { other: { event: SchedulerEvent } }) => info.other.event.title === 'Lunch',
          ],
        ]),
        initial: 'Allow',
        libraryDefault: 'allow',
      },
      {
        key: 'durationLimits',
        help: 'Shortest and longest an event may be resized to.',
        control: choice([
          [NONE, undefined],
          ['15 minutes to 4 hours', { min: 15, max: 240 }],
        ]),
        initial: NONE,
      },
      {
        key: 'canDrag',
        help: 'Per-event permission to move.',
        control: choice([
          ['Every event', undefined],
          ['Not past events', (o: Occ) => o.endMs > Date.now()],
        ]),
        initial: 'Every event',
      },
      {
        key: 'canResize',
        help: 'Per-event permission to resize.',
        control: choice([
          ['Every event', undefined],
          ['Not all-day events', (o: Occ & { allDay: boolean }) => !o.allDay],
        ]),
        initial: 'Every event',
      },
      {
        key: 'canDrop',
        help: 'Whether a move or resize may end here.',
        control: choice([
          ['Anywhere', undefined],
          ['Not on weekends', (info: DayInfo) => !isWeekend(info)],
        ]),
        initial: 'Anywhere',
      },
      {
        key: 'canSelect',
        help: 'Whether a range may be selected.',
        control: choice([
          ['Anywhere', undefined],
          ['Not in the past', (info: DayInfo) => !inPast(info)],
        ]),
        initial: 'Anywhere',
      },
      {
        key: 'canReceive',
        help: 'Whether an event dragged in from the sidebar may land here.',
        control: choice([
          ['Anywhere', undefined],
          ['Not on weekends', (info: DayInfo) => !isWeekend(info)],
        ]),
        initial: 'Anywhere',
      },
    ],
  },
  {
    id: 'display',
    title: 'Display',
    settings: [
      {
        key: 'theme',
        help: 'Color scheme; "auto" follows the system.',
        control: choice([
          ['Light', 'light'],
          ['Dark', 'dark'],
          ['Auto', 'auto'],
        ]),
        initial: 'Light',
        libraryDefault: 'light',
      },
      {
        key: 'preset',
        help: 'Visual treatment, independent of the color scheme.',
        control: choice(
          (
            [
              ['Default', 'default'],
              ['Modern', 'modern'],
              ['Glassmorphism', 'glassmorphism'],
              ['Neumorphic', 'neumorphic'],
              ['Clean', 'clean'],
              ['Bento grids', 'bento'],
              ['Neo-brutalism', 'neo-brutalism'],
              ['Retro futurism / Cyber-Y2K', 'cyber-y2k'],
            ] as [string, SchedulerPreset][]
          ).map(([l, v]) => [l, v]),
        ),
        initial: 'Default',
        libraryDefault: 'default',
      },
      {
        key: 'animate',
        help: 'Navigation, views, popovers and moved events animate.',
        control: { kind: 'boolean' },
        initial: true,
        libraryDefault: true,
      },
      {
        key: 'colorBlindMode',
        help: 'Color-independent event markers in compact month view.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'showConflicts',
        help: 'Marks events that overlap on a resource.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'liveProgress',
        help: 'Running events show how far along they are.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'dayUtilization',
        help: 'How full each day is, in the month view.',
        control: choice([
          ['Off', false],
          ['On (8 hours)', true],
          ['On (4 hours)', { capacity: 240 }],
        ]),
        initial: 'Off',
        libraryDefault: false,
      },
      {
        key: 'eventFilter',
        help: 'Hide or dim events without changing the data.',
        control: choice([
          ['Show all', undefined],
          ['Dim past events', (o: Occ) => (o.endMs < Date.now() ? 'dim' : true)],
          ['Hide Lunch', (o: Occ) => o.event.title !== 'Lunch'],
          ['Only inspections', (o: Occ) => o.event.title === 'Inspection'],
        ]),
        initial: 'Show all',
      },
      {
        key: 'eventAttrs',
        help: 'Extra class, style or attributes per event.',
        control: choice([
          [NONE, undefined],
          [
            'Dashed outline on concrete pours',
            (o: Occ) =>
              o.event.title === 'Concrete pour'
                ? { style: { outline: '2px dashed currentColor', outlineOffset: '-2px' } }
                : undefined,
          ],
        ]),
        initial: NONE,
      },
      {
        key: 'slotAttrs',
        help: 'Extra class, style or attributes per cell.',
        control: choice([
          [NONE, undefined],
          [
            'Tint 12:00 to 13:00',
            (info: DayInfo) =>
              !info.allDay && info.start.hour === 12
                ? { style: { background: 'color-mix(in srgb, #ca8a04 12%, transparent)' } }
                : undefined,
          ],
        ]),
        initial: NONE,
      },
      {
        key: 'pt',
        help: 'Attributes for any part of the scheduler (passthrough).',
        control: choice([
          [NONE, undefined],
          [
            "Underline today's header",
            {
              dayHeader: ({ column }: { column: { isToday: boolean } }) =>
                column.isToday ? { style: { textDecoration: 'underline' } } : {},
            },
          ],
        ]),
        initial: NONE,
      },
      {
        key: 'presence',
        help: 'Who has an event open, shown on the event.',
        control: choice([
          [NONE, undefined],
          [
            'Two colleagues',
            [
              { id: 'an', name: 'An', color: '#db2777', eventId: 'sprint' },
              { id: 'jo', name: 'Jo', color: '#0891b2', eventId: 'night-shift' },
            ],
          ],
        ]),
        initial: NONE,
      },
      {
        key: 'suggestions',
        help: 'Times to offer in the grid; clicking one emits `suggestion-click`.',
        control: choice([
          [NONE, undefined],
          [
            'Three free times this week',
            [
              { start: at(1, '15:00'), end: at(1, '16:00'), title: 'Free' },
              { start: at(2, '08:00'), end: at(2, '09:00'), title: 'Free' },
              { start: at(3, '16:30'), end: at(3, '17:30'), title: 'Free' },
            ],
          ],
        ]),
        initial: NONE,
      },
      {
        key: 'loading',
        help: 'The loading overlay.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'error',
        help: 'The error overlay, with its message.',
        control: choice([
          [NONE, undefined],
          ['Could not load the events', 'Could not load the events'],
        ]),
        initial: NONE,
      },
    ],
  },
  {
    id: 'toolbar',
    title: 'Toolbar and navigation',
    settings: [
      {
        key: 'toolbar',
        help: 'The built-in toolbar.',
        control: { kind: 'boolean' },
        initial: true,
        libraryDefault: true,
      },
      {
        key: 'maxViewButtons',
        help: 'More view buttons than this go into a menu.',
        control: choice([
          ['All', undefined],
          ['4', 4],
          ['6', 6],
        ]),
        initial: 'All',
      },
      {
        key: 'titleDatePicker',
        help: 'The title opens a date picker.',
        control: { kind: 'boolean' },
        initial: false,
        libraryDefault: false,
      },
      {
        key: 'pictureInPicture',
        help: 'Button that pops the scheduler out into an always-on-top window.',
        control: { kind: 'boolean' },
        initial: true,
        libraryDefault: true,
      },
      {
        key: 'drillDownView',
        help: 'View opened when a date is clicked.',
        control: choice([
          [NONE, undefined],
          ['Day', 'day'],
          ['Week', 'week'],
        ]),
        initial: 'Day',
      },
      {
        key: 'keymap',
        help: 'Replaces keyboard shortcuts.',
        control: choice([
          ['Default', undefined],
          [
            'J and K for next and previous, M for month',
            { next: 'j', prev: 'k', 'view:month': 'm' },
          ],
        ]),
        initial: 'Default',
      },
      {
        key: 'responsiveViews',
        help: 'Which views to offer up to a width. Try it with the phone frame.',
        control: choice([
          [NONE, undefined],
          ['Up to 700 px: day and agenda', [{ maxWidth: 700, views: ['day', 'agenda'] }]],
        ]),
        initial: NONE,
      },
    ],
  },
  {
    id: 'resources',
    title: 'Resources',
    settings: [
      {
        key: 'resourceOrder',
        help: 'Order of sibling resources.',
        control: choice([
          ['As given', undefined],
          [
            'Title A to Z',
            (a: { title?: string }, b: { title?: string }) =>
              (a.title ?? '').localeCompare(b.title ?? ''),
          ],
          [
            'Title Z to A',
            (a: { title?: string }, b: { title?: string }) =>
              (b.title ?? '').localeCompare(a.title ?? ''),
          ],
        ]),
        initial: 'As given',
      },
      {
        key: 'resourceFilter',
        help: 'Which resources show; their groups stay.',
        control: choice([
          ['All', undefined],
          [
            'Crews only',
            (r: { id: unknown; parentId?: unknown }) => r.id === 'crews' || r.parentId === 'crews',
          ],
          [
            'Hide meeting rooms',
            (r: { id: unknown; parentId?: unknown }) => r.id !== 'rooms' && r.parentId !== 'rooms',
          ],
        ]),
        initial: 'All',
      },
    ],
  },
  {
    id: 'code',
    title: 'Set in code',
    settings: [
      {
        key: 'events',
        help: 'Your events.',
        control: { kind: 'code', note: 'Generated by Data above.' },
        initial: undefined,
      },
      {
        key: 'resources',
        help: 'Your resources.',
        control: { kind: 'code', note: 'Generated by Data above.' },
        initial: undefined,
      },
      {
        key: 'accessors',
        help: 'Read fields from your own event shape.',
        control: {
          kind: 'code',
          note: 'No visible effect: the playground uses the default shape.',
        },
        initial: undefined,
      },
      {
        key: 'resourceAccessors',
        help: 'Read fields from your own resource shape.',
        control: {
          kind: 'code',
          note: 'No visible effect: the playground uses the default shape.',
        },
        initial: undefined,
      },
      {
        key: 'dateAdapter',
        help: 'Parse other date types in event fields.',
        control: { kind: 'code', note: 'No visible effect: the playground uses ISO strings.' },
        initial: undefined,
      },
      {
        key: 'plugins',
        help: '`{ name, install(context) }` objects.',
        control: { kind: 'code', note: 'See Slots and parts for examples.' },
        initial: undefined,
      },
      {
        key: 'storageKey',
        help: 'Remembers view, date and zoom per browser.',
        control: { kind: 'code', note: 'The playground uses "schedvueler:playground".' },
        initial: undefined,
      },
    ],
  },
  {
    id: 'css',
    title: 'Theme variables',
    settings: [
      {
        key: '--orb-color-accent',
        help: 'Accent color; starts with the preset’s.',
        control: { kind: 'color' },
        initial: '#2563eb',
        css: true,
      },
      {
        key: '--orb-slot-height',
        help: 'Height of a time-grid slot.',
        control: { kind: 'range', min: 20, max: 72, unit: 'px' },
        initial: 36,
        css: true,
      },
      {
        key: '--orb-event-radius',
        help: 'Corner radius of events (the preset sets its own).',
        control: { kind: 'range', min: 0, max: 12, unit: 'px' },
        initial: 6,
        css: true,
      },
      {
        key: '--orb-month-event-height',
        help: 'Height of a month event bar.',
        control: { kind: 'range', min: 16, max: 32, unit: 'px' },
        initial: 22,
        css: true,
      },
    ],
  },
]

// --- the views -------------------------------------------------------------------------------

export type ViewKind = 'time' | 'month' | 'year' | 'agenda' | 'timeline' | 'multi-month' | 'gantt'

const minWidth: Setting = {
  key: 'minWidth',
  help: 'Only offered when the scheduler is at least this wide.',
  control: choice([
    ['Always', undefined],
    ['600 px', 600],
    ['900 px', 900],
  ]),
  initial: 'Always',
}

const timelineCommon: Setting[] = [
  {
    key: 'period',
    help: 'How much one page shows.',
    control: choice([
      ['Day', 'day'],
      ['Week', 'week'],
      ['Month', 'month'],
    ]),
    initial: 'Day',
  },
  {
    key: 'slotWidth',
    help: 'Column width in px; columns stretch when there is room.',
    control: choice([
      ['Default', undefined],
      ...[40, 64, 120, 200].map((n): [string, unknown] => [`${n} px`, n]),
    ]),
    initial: 'Default',
  },
  {
    key: 'eventHeight',
    help: 'Height of an event bar.',
    control: { kind: 'number', min: 16, max: 60 },
    initial: 28,
    libraryDefault: 28,
  },
  {
    key: 'rowMinHeight',
    help: 'Smallest row height.',
    control: { kind: 'number', min: 24, max: 120 },
    initial: 44,
    libraryDefault: 44,
  },
  {
    key: 'headerTiers',
    help: 'Extra header rows above the days.',
    control: choice([
      [NONE, undefined],
      ['Week', ['week']],
      ['Month and week', ['month', 'week']],
      ['Year and month', ['year', 'month']],
    ]),
    initial: NONE,
  },
  {
    key: 'virtual',
    help: 'Render only the visible rows.',
    control: { kind: 'boolean' },
    initial: true,
    libraryDefault: true,
  },
  {
    key: 'dependencies',
    help: 'Arrows between events with `dependsOn`.',
    control: yesNoDefault('Default'),
    initial: 'Default',
  },
]

export const viewSettings: Record<ViewKind, Setting[]> = {
  time: [
    {
      key: 'days',
      help: 'Number of days shown.',
      control: { kind: 'number', min: 1, max: 14 },
      initial: 7,
    },
    {
      key: 'allDaySlot',
      help: 'The all-day row above the times.',
      control: { kind: 'boolean' },
      initial: true,
      libraryDefault: true,
    },
    {
      key: 'workWeek',
      help: 'Only the work days.',
      control: { kind: 'boolean' },
      initial: false,
      libraryDefault: false,
    },
    {
      key: 'foldEmptyHours',
      help: 'Collapses stretches without events into one row.',
      control: choice([
        ['Off', undefined],
        ['On', true],
        ['From 2 hours', 120],
      ]),
      initial: 'Off',
    },
    {
      key: 'eventStackThreshold',
      help: 'From this many overlapping events on, they go into one stack.',
      control: choice([
        ['Off', undefined],
        ['3', 3],
        ['4', 4],
      ]),
      initial: 'Off',
    },
    {
      key: 'resources',
      help: 'A column per resource.',
      control: choice([
        [NONE, undefined],
        ['Crews', ['crews-1', 'crews-2', 'crews-3']],
        ['Crews and a crane', ['crews-1', 'crews-2', 'crews-3', 'cranes-1']],
      ]),
      initial: NONE,
    },
    {
      key: 'groupBy',
      help: 'With resources: columns grouped by resource or by date.',
      control: choice([
        ['Resource', 'resource'],
        ['Date', 'date'],
      ]),
      initial: 'Resource',
      libraryDefault: 'resource',
    },
    minWidth,
  ],
  month: [
    {
      key: 'weeks',
      help: 'Show this many weeks instead of a month.',
      control: choice([
        ['A month', undefined],
        ['2 weeks', 2],
        ['3 weeks', 3],
      ]),
      initial: 'A month',
    },
    {
      key: 'maxEventRows',
      help: 'Event rows per day before "+N more".',
      control: choice([
        ['Auto', 'auto'],
        ['2', 2],
        ['3', 3],
        ['5', 5],
      ]),
      initial: 'Auto',
      libraryDefault: 'auto',
    },
    {
      key: 'fixedWeeks',
      help: 'Always six weeks.',
      control: { kind: 'boolean' },
      initial: false,
      libraryDefault: false,
    },
    {
      key: 'compactWidth',
      help: 'Below this width days show dots.',
      control: { kind: 'number', min: 200, max: 1200, step: 20 },
      initial: 560,
      libraryDefault: 560,
    },
    minWidth,
  ],
  year: [
    {
      key: 'display',
      help: 'How a day shows its events.',
      control: choice([
        ['Dots', 'dots'],
        ['Heatmap', 'heatmap'],
        ['Planner', 'planner'],
      ]),
      initial: 'Heatmap',
      libraryDefault: 'dots',
    },
    minWidth,
  ],
  agenda: [
    {
      key: 'period',
      help: 'How much one page lists.',
      control: choice([
        ['Day', 'day'],
        ['Week', 'week'],
        ['Month', 'month'],
      ]),
      initial: 'Week',
      libraryDefault: 'week',
    },
    {
      key: 'showEmptyDays',
      help: 'List days without events too.',
      control: { kind: 'boolean' },
      initial: false,
      libraryDefault: false,
    },
    {
      key: 'virtual',
      help: 'Render only the visible rows.',
      control: { kind: 'boolean' },
      initial: true,
      libraryDefault: true,
    },
    minWidth,
  ],
  timeline: [
    ...timelineCommon,
    {
      key: 'dayEvents',
      help: 'Timed events in day-wide columns.',
      control: choice([
        ['Bars', 'bars'],
        ['Compact', 'compact'],
        ['Count', 'count'],
      ]),
      initial: 'Bars',
      libraryDefault: 'bars',
    },
    {
      key: 'zoomLevels',
      help: 'Levels to zoom through with Ctrl + scroll.',
      control: choice([
        [NONE, undefined],
        [
          'Hours, half days, days',
          [
            { label: 'Hours', slotDuration: 60, slotWidth: 64 },
            { label: 'Half days', slotDuration: 720, slotWidth: 80 },
            { label: 'Days', slotDuration: 1440, slotWidth: 120 },
          ],
        ],
      ]),
      initial: NONE,
    },
    {
      key: 'resourceSearch',
      help: 'A search box above the resources.',
      control: { kind: 'boolean' },
      initial: false,
      libraryDefault: false,
    },
    {
      key: 'resourceColumns',
      help: 'More columns next to the resource names.',
      control: choice([
        [NONE, undefined],
        ['Group', [{ key: 'parentId', label: 'Group', width: '6rem' }]],
      ]),
      initial: NONE,
    },
    {
      key: 'resourceAreaWidth',
      help: 'Width of the resource column (CSS length).',
      control: { kind: 'text', placeholder: '12rem' },
      initial: '12rem',
      libraryDefault: '12rem',
    },
    {
      key: 'resourceAreaResizable',
      help: 'Drag the divider to resize the resource column.',
      control: { kind: 'boolean' },
      initial: true,
      libraryDefault: true,
    },
    {
      key: 'resourceReorder',
      help: 'Drag resources to reorder them.',
      control: { kind: 'boolean' },
      initial: false,
      libraryDefault: false,
    },
    {
      key: 'load',
      help: 'How busy each row is, per day.',
      control: choice([
        ['Off', undefined],
        ['On (8 hours)', true],
        ['On (4 hours)', { capacity: 240 }],
      ]),
      initial: 'Off',
    },
    {
      key: 'minimap',
      help: 'An overview strip to navigate long timelines.',
      control: { kind: 'boolean' },
      initial: false,
      libraryDefault: false,
    },
    minWidth,
  ],
  'multi-month': [
    {
      key: 'months',
      help: 'Number of months.',
      control: { kind: 'number', min: 1, max: 12 },
      initial: 3,
      libraryDefault: 3,
    },
    {
      key: 'maxEventRows',
      help: 'Event rows per day before "+N more".',
      control: { kind: 'number', min: 1, max: 6 },
      initial: 3,
      libraryDefault: 3,
    },
    minWidth,
  ],
  gantt: [
    ...timelineCommon.map((s) => (s.key === 'period' ? { ...s, initial: 'Month' } : s)),
    minWidth,
  ],
}

// --- values --------------------------------------------------------------------------------

/** The value a setting passes, from what its control holds. */
export function resolve(setting: Setting, stored: unknown): unknown {
  const c = setting.control
  if (c.kind === 'choice') return c.options.find((o) => o.label === stored)?.value
  if (c.kind === 'range') return `${stored}${c.unit}`
  return stored
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Whether the control moved away from where the playground started. */
export const isChanged = (setting: Setting, stored: unknown) => !same(stored, setting.initial)

/** The library's default, as a value. */
function libraryValue(setting: Setting): unknown {
  if ('libraryDefault' in setting) return setting.libraryDefault
  return undefined
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** One attribute of "Copy as code", or `null` when it is the library's default. */
export function asAttribute(setting: Setting, stored: unknown): string | null {
  if (setting.css || setting.control.kind === 'code') return null
  const value = resolve(setting, stored)
  if (value === undefined || same(value, libraryValue(setting))) return null
  const name = kebab(setting.key)
  if (value === true) return name
  if (typeof value === 'string') return `${name}="${value}"`
  const json = hasFunction(value) ? undefined : JSON.stringify(value)
  // Functions and long data are your own code: name the example instead.
  if (json === undefined || json.length > 100) return `:${name}="…" <!-- ${String(stored)} -->`
  return json.includes('"') ? `:${name}='${json}'` : `:${name}="${json}"`
}

function hasFunction(value: unknown): boolean {
  if (typeof value === 'function') return true
  if (Array.isArray(value)) return value.some(hasFunction)
  if (value && typeof value === 'object') return Object.values(value).some(hasFunction)
  return false
}
