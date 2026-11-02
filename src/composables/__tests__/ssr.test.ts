import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { MonthView, Scheduler, WeekView } from '../../components'

// Runs in Node, where there is no window or document, as on a server.
describe('on a server', () => {
  it('has no browser globals to lean on', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
  })

  it('renders to a string', async () => {
    const app = createSSRApp({
      render: () =>
        h(
          Scheduler as never,
          {
            events: [
              { id: 'a', title: 'Alpha', start: '2026-06-15T09:00:00', end: '2026-06-15T10:00:00' },
            ],
            date: '2026-06-15',
            timeZone: 'Europe/Brussels',
            locale: 'en-GB',
          },
          { default: () => [h(WeekView), h(MonthView)] },
        ),
    })
    const html = await renderToString(app)
    expect(html).toContain('data-orb-part="root"')
    expect(html).toContain('data-orb-part="timeGrid"')
    expect(html).toContain('Alpha')
    expect(html).toContain('21 Jun 2026')
    expect(html).toContain('data-orb-part="viewButton"')
  })
})
