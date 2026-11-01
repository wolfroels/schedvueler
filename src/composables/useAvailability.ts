import { computed } from 'vue'
import {
  Temporal,
  closedIntervals,
  daysBetween,
  minutesIntoDay,
  parseDateInput,
  resolveZoned,
  type BusinessHours,
  type EventOccurrence,
  type ResolvedBlockedTime,
  type ResourceId,
} from '../core'
import type { SchedulerContext } from './context'

/** A stretch of a day column drawn behind the events. */
export interface AvailabilityShade {
  key: string
  kind: 'closed' | 'blocked' | 'background'
  /** Wall-clock minutes from the midnight of the date. */
  start: number
  end: number
  title: string | undefined
  color: string | undefined
  occurrence: EventOccurrence<unknown> | undefined
}

/** Business hours, blocked times and background events, resolved for drawing and checking. */
export function createAvailability<T>(ctx: SchedulerContext<T>) {
  const blockedTimes = computed<ResolvedBlockedTime[]>(() => {
    const { timeZone, raw } = ctx.options.value
    const parse = raw.dateAdapter?.parse ?? parseDateInput
    return (raw.blockedTimes ?? []).map((source) => ({
      startMs: resolveZoned(parse(source.start), timeZone).epochMilliseconds,
      endMs: resolveZoned(parse(source.end), timeZone).epochMilliseconds,
      resourceIds:
        source.resourceIds ?? (source.resourceId != null ? [source.resourceId] : undefined),
      source,
    }))
  })

  /** The hours of a resource: its own, or else the scheduler's. */
  function hoursFor(resourceId: ResourceId | undefined): BusinessHours | undefined {
    const own = resourceId === undefined ? undefined : ctx.resourceMap.value.get(resourceId)
    return own?.businessHours ?? ctx.options.value.raw.businessHours
  }

  /** Whether anything is drawn at all, to skip the work when nothing is. */
  const hasShades = computed(
    () =>
      !!ctx.options.value.raw.businessHours ||
      blockedTimes.value.length > 0 ||
      ctx.backgroundOccurrences.value.length > 0 ||
      ctx.resources.value.some((r) => r.businessHours),
  )

  /** Minutes from the midnight of `date` to a moment; can fall outside 0-1440. */
  function minuteOn(date: Temporal.PlainDate, ms: number): number {
    const zoned = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(
      ctx.options.value.timeZone,
    )
    return daysBetween(date, zoned.toPlainDate()) * 1440 + minutesIntoDay(zoned)
  }

  /** What to draw behind the events of a date, within the visible minutes `[from, to)`. */
  function shadesFor(
    date: Temporal.PlainDate,
    resourceId: ResourceId | undefined,
    from = 0,
    to = 1440,
  ): AvailabilityShade[] {
    if (!hasShades.value) return []
    const out: AvailabilityShade[] = []
    const hours = hoursFor(resourceId)
    if (hours) {
      for (const r of closedIntervals(date, hours, from, to)) {
        out.push({
          key: `closed-${r.start}`,
          kind: 'closed',
          ...r,
          title: undefined,
          color: undefined,
          occurrence: undefined,
        })
      }
    }
    const add = (
      key: string,
      kind: AvailabilityShade['kind'],
      startMs: number,
      endMs: number,
      resourceIds: readonly ResourceId[] | undefined,
      title: string | undefined,
      color: string | undefined,
      occurrence: EventOccurrence<unknown> | undefined,
    ) => {
      if (resourceId !== undefined && resourceIds?.length && !resourceIds.includes(resourceId))
        return
      const start = Math.max(minuteOn(date, startMs), from)
      const end = Math.min(minuteOn(date, endMs), to)
      if (end > start) out.push({ key, kind, start, end, title, color, occurrence })
    }
    blockedTimes.value.forEach((b, i) =>
      add(
        `blocked-${i}`,
        'blocked',
        b.startMs,
        b.endMs,
        b.resourceIds,
        b.source.title,
        undefined,
        undefined,
      ),
    )
    const a = ctx.accessors.value
    for (const occ of ctx.backgroundOccurrences.value) {
      add(
        `bg-${occ.key}`,
        'background',
        occ.startMs,
        occ.endMs,
        occ.resourceIds,
        a.title(occ.event),
        a.color(occ.event),
        occ as EventOccurrence<unknown>,
      )
    }
    return out
  }

  /** Whether a whole date has no open hours, for day cells. */
  function isClosedDay(date: Temporal.PlainDate, resourceId?: ResourceId): boolean {
    const hours = hoursFor(resourceId)
    return !!hours && closedIntervals(date, hours).some((r) => r.start === 0 && r.end === 1440)
  }

  return { blockedTimes, hoursFor, hasShades, shadesFor, isClosedDay }
}

export type SchedulerAvailability = ReturnType<typeof createAvailability>
