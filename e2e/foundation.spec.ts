import { readFileSync } from 'node:fs'
import { expect, open, test } from './helpers'

// Every slot name in the types, with what is needed for it to appear.
const types = readFileSync('src/types.ts', 'utf8')
const SLOTS = [
  ...types
    .slice(types.indexOf('export interface SchedulerSlots<T>'))
    .matchAll(/^ {2}'?([a-z-]+)'?\?: /gm),
].map((m) => m[1]!)

const WITH_ALL_SLOTS = (view: string) => ({ view, allSlots: '1' })

test.describe('slots', () => {
  /** Which view shows a slot without any further setup. */
  const VISIBLE: Record<string, string[]> = {
    week: [
      'toolbar-start',
      'toolbar-center',
      'toolbar-end',
      'day-header',
      'all-day-label',
      'time-label',
      'time-slot',
      'time-event',
      'all-day-event',
      'resize-handle',
    ],
    month: ['month-weekday', 'month-cell', 'month-event', 'more-link'],
    year: ['year-day', 'year-month-header'],
    agenda: ['agenda-event', 'agenda-day-header'],
    timeline: ['resource-area-header', 'resource-label', 'timeline-header', 'timeline-event'],
  }

  for (const [view, names] of Object.entries(VISIBLE)) {
    test(`${view}: the slots render`, async ({ page }) => {
      await open(page, WITH_ALL_SLOTS(view))
      for (const name of names) {
        await expect(page.locator(`[data-slot="${name}"]`).first(), name).toBeAttached()
      }
    })
  }

  test('every slot in the types is known to the test', () => {
    const conditional = [
      'default',
      'title',
      'nav-prev',
      'nav-next',
      'today-button',
      'view-switcher',
      'toolbar',
      'view-button',
      'event',
      'event-content',
      'drag-preview',
      'selection',
      'month-day-number',
      'more-popover',
      'now-indicator',
      'agenda-empty',
    ]
    const known = new Set([...conditional, ...Object.values(VISIBLE).flat()])
    // Slots that need a feature switched on are tested with that feature.
    const featureSlots = SLOTS.filter((s) => !known.has(s))
    expect(SLOTS.length).toBeGreaterThan(40)
    expect(featureSlots).toEqual(
      expect.arrayContaining(['closed-time', 'blocked-time', 'minimap', 'presence']),
    )
  })

  test('a fuller slot wins over the general one', async ({ page }) => {
    await open(page, WITH_ALL_SLOTS('week'))
    const alpha = page.locator('[data-orb-key="alpha"]')
    await expect(alpha.locator('[data-slot="time-event"]')).toBeVisible()
    await expect(alpha.locator('[data-slot="event"]')).toHaveCount(0)
    await expect(alpha).not.toContainText('Alpha')
  })
})

test.describe('server rendering', () => {
  test('renders on the server, and hydrates without a mismatch', async ({ page }) => {
    // Any hydration warning fails the test through the page problem check.
    await page.goto('/e2e/fixture/?page=ssr')
    await expect(page.locator('.ssr-state')).toHaveText('hydrated')
    await expect(page.locator('[data-orb-part="root"]')).toBeVisible()
    await expect(page.locator('.ssr-html')).toContainText('data-orb-part')
    await expect(page.locator('.orb-event', { hasText: 'Alpha' })).toBeVisible()
    // The toolbar is complete in the HTML, and stays so after hydrating.
    await expect(page.locator('.ssr-html')).toContainText('21 Jun 2026')
    await expect(page.locator('.ssr-html')).toContainText('viewButton')
    await expect(page.locator('[data-orb-part="title"]')).toContainText('21 Jun 2026')
    await expect(page.locator('[data-orb-part="viewButton"]')).toHaveCount(2)
    await page.locator('[data-orb-part="viewButton"]', { hasText: 'Month' }).click()
    await expect(page.locator('[data-orb-part="monthGrid"]')).toBeVisible()
  })
})

test.describe('how it looks', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Baselines are for one browser')
  test.skip(() => !!process.env.CI, 'Baselines depend on the fonts of the machine')

  for (const view of ['week', 'month', 'year', 'agenda', 'timeline', 'rooms', 'gantt', 'planner']) {
    for (const theme of ['light', 'dark']) {
      test(`${view}, ${theme}`, async ({ page }) => {
        await open(page, { view, date: '2026-06-15' }, { theme })
        await expect(page.locator('.orb-scheduler')).toHaveScreenshot(`${view}-${theme}.png`, {
          maxDiffPixelRatio: 0.01,
          animations: 'disabled',
        })
      })
    }
  }
})
