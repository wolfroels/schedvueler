import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { Temporal, recurrenceToText } from '../../core'
import { defaultMessages } from '../../types'
import { de, es, fr, nl } from '../../locales'
import type { RangeChangePayload } from '../../types'
import { useChangeTracking, useEventSource, type EventSourceRequest } from '../useEventSource'

const DAY = 86_400_000
const range = (startMs: number, endMs: number): RangeChangePayload => ({
  view: 'week',
  start: Temporal.PlainDate.from('2026-06-15'),
  end: Temporal.PlainDate.from('2026-06-22'),
  activeStart: Temporal.PlainDate.from('2026-06-15'),
  activeEnd: Temporal.PlainDate.from('2026-06-22'),
  startMs,
  endMs,
  timeZone: 'UTC',
})

describe('useEventSource', () => {
  function source() {
    const calls: EventSourceRequest[] = []
    const pending: ((list: { id: number }[]) => void)[] = []
    const s = useEventSource<{ id: number }>({
      fetch: (request) => {
        calls.push(request)
        return new Promise((resolve) => pending.push(resolve))
      },
    })
    return { s, calls, pending }
  }

  it('loads a range once, and only the new part after that', async () => {
    const { s, calls, pending } = source()
    s.onRangeChange(range(0, 7 * DAY))
    expect(s.loading.value).toBe(true)
    pending[0]!([{ id: 1 }])
    await nextTick()
    await Promise.resolve()
    expect(s.loading.value).toBe(false)
    expect(s.events.value).toEqual([{ id: 1 }])

    s.onRangeChange(range(0, 7 * DAY))
    expect(calls).toHaveLength(1)

    s.onRangeChange(range(3 * DAY, 10 * DAY))
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ startMs: 7 * DAY, endMs: 10 * DAY })
  })

  it('cancels a stale request and ignores its answer', async () => {
    const { s, calls, pending } = source()
    s.onRangeChange(range(0, DAY))
    s.onRangeChange(range(10 * DAY, 11 * DAY))
    expect(calls[0]!.signal.aborted).toBe(true)
    pending[0]!([{ id: 1 }])
    pending[1]!([{ id: 2 }])
    await new Promise((r) => setTimeout(r))
    expect(s.events.value).toEqual([{ id: 2 }])
    expect(s.loading.value).toBe(false)
  })

  it('merges results by id, and refetches', async () => {
    const { s, calls, pending } = source()
    s.onRangeChange(range(0, DAY))
    pending[0]!([{ id: 1 }])
    await new Promise((r) => setTimeout(r))
    void s.refetch()
    expect(calls).toHaveLength(2)
  })

  it('reports errors', async () => {
    const s = useEventSource({ fetch: () => Promise.reject(new Error('down')) })
    s.onRangeChange(range(0, DAY))
    await new Promise((r) => setTimeout(r))
    expect((s.error.value as Error).message).toBe('down')
    expect(s.loading.value).toBe(false)
  })
})

describe('useChangeTracking', () => {
  it('tracks, saves and discards', () => {
    effectScope().run(() => {
      const a = { id: 1 }
      const events = shallowRef<readonly { id: number }[]>([a])
      const t = useChangeTracking(events)
      expect(t.hasChanges.value).toBe(false)
      events.value = [a, { id: 2 }]
      expect(t.changes.value.created).toEqual([{ id: 2 }])
      t.discard()
      expect(events.value).toEqual([a])
      events.value = []
      expect(t.changes.value.deleted).toEqual([a])
      t.markSaved()
      expect(t.hasChanges.value).toBe(false)
    })
  })
})

describe('locale packs', () => {
  it('describe rules in each language', () => {
    const rule = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=3'
    expect(recurrenceToText(rule, { locale: 'nl', strings: nl.recurrence })).toBe(
      'Elke 2 weken op maandag en vrijdag, 3 keer',
    )
    expect(recurrenceToText(rule, { locale: 'fr', strings: fr.recurrence })).toBe(
      'Toutes les 2 semaines le lundi et vendredi, 3 fois',
    )
    expect(recurrenceToText('FREQ=DAILY', { locale: 'de', strings: de.recurrence })).toBe(
      'Jeden Tag',
    )
    expect(recurrenceToText('FREQ=DAILY', { locale: 'es', strings: es.recurrence })).toBe(
      'Cada día',
    )
  })
})

describe('translations', () => {
  it('leave no message in English, except the arrows of hidden events', () => {
    const expected = Object.keys(defaultMessages).filter((key) => key !== 'hiddenEvents')
    for (const locale of [nl, fr, de, es]) {
      expect(Object.keys(locale.messages).sort()).toEqual(expected.sort())
    }
  })

  it('use the right gender in French', () => {
    expect(fr.recurrence.every('YEARLY', 1)).toBe('Chaque année')
    expect(fr.recurrence.every('YEARLY', 2)).toBe('Tous les 2 ans')
    expect(fr.recurrence.every('WEEKLY', 2)).toBe('Toutes les 2 semaines')
    expect(fr.recurrence.every('HOURLY', 3)).toBe('Toutes les 3 heures')
    expect(fr.recurrence.every('DAILY', 3)).toBe('Tous les 3 jours')
  })
})
