import { Temporal, type SchedulerEvent } from '../src'

const COLORS = [
  '#2563eb',
  '#16a34a',
  '#db2777',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
]
const TITLES = [
  'Design review',
  'Site visit',
  'Client call',
  'Planning',
  'Budget sync',
  '1:1',
  'Safety briefing',
  'Procurement',
  'Lunch',
  'Workshop',
  'Interview',
  'Stand-up',
  'Concrete pour',
  'Inspection',
  'Retro',
]

/** Small seeded PRNG so every reload shows the same data. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generates `count` random events spread over ±60 days around `around`, plus a fixed set of
 * recurring and edge-case events.
 */
export function generateEvents(count: number, around: Temporal.PlainDate): SchedulerEvent[] {
  const rand = mulberry32(42)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!
  const events: SchedulerEvent[] = []
  const spanDays = 120
  const start = around.subtract({ days: spanDays / 2 })

  for (let i = 0; i < count; i++) {
    const day = start.add({ days: Math.floor(rand() * spanDays) })
    const roll = rand()
    if (roll < 0.06) {
      const length = 1 + Math.floor(rand() * 4)
      events.push({
        id: `gen-${i}`,
        title: pick(['Holiday', 'Conference', 'Trade fair', 'Training']),
        start: day.toString(),
        end: day.add({ days: length }).toString(),
        color: pick(COLORS),
      })
      continue
    }
    const hour = 7 + Math.floor(rand() * 11)
    const minute = pick([0, 0, 15, 30, 45])
    const duration = pick([15, 30, 30, 45, 60, 60, 90, 120, 180])
    const begin = day.toPlainDateTime({ hour, minute })
    events.push({
      id: `gen-${i}`,
      title: pick(TITLES),
      start: begin.toString(),
      end: begin.add({ minutes: duration }).toString(),
      color: pick(COLORS),
    })
  }

  const monday = around.subtract({ days: around.dayOfWeek - 1 })
  events.push(
    {
      id: 'standup',
      title: 'Daily stand-up',
      start: monday.subtract({ weeks: 8 }).toPlainDateTime({ hour: 9 }).toString(),
      end: monday.subtract({ weeks: 8 }).toPlainDateTime({ hour: 9, minute: 15 }).toString(),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      exdates: [monday.add({ days: 2 }).toPlainDateTime({ hour: 9 }).toString()],
      color: '#0891b2',
    },
    {
      id: 'standup-moved',
      title: 'Daily stand-up (moved)',
      start: monday.add({ days: 3 }).toPlainDateTime({ hour: 11 }).toString(),
      end: monday.add({ days: 3 }).toPlainDateTime({ hour: 11, minute: 15 }).toString(),
      recurringEventId: 'standup',
      recurrenceId: monday.add({ days: 3 }).toPlainDateTime({ hour: 9 }).toString(),
      color: '#0891b2',
    },
    {
      id: 'review',
      title: 'Monthly review (last Friday)',
      start: monday.subtract({ months: 3 }).toPlainDateTime({ hour: 14 }).toString(),
      end: monday.subtract({ months: 3 }).toPlainDateTime({ hour: 15, minute: 30 }).toString(),
      rrule: 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1',
      color: '#7c3aed',
    },
    {
      id: 'night-shift',
      title: 'Night shift',
      start: monday.add({ days: 1 }).toPlainDateTime({ hour: 22 }).toString(),
      end: monday.add({ days: 2 }).toPlainDateTime({ hour: 6 }).toString(),
      color: '#ea580c',
    },
    {
      id: 'ny-call',
      title: 'New York call (10:00 NY time)',
      start: monday.add({ days: 2 }).toPlainDateTime({ hour: 10 }).toString(),
      end: monday.add({ days: 2 }).toPlainDateTime({ hour: 11 }).toString(),
      timezone: 'America/New_York',
      color: '#db2777',
    },
    {
      id: 'sprint',
      title: 'Sprint 42',
      start: monday.toString(),
      end: monday.add({ weeks: 2 }).toString(),
      rrule: null,
      color: '#16a34a',
    },
  )
  return events
}
