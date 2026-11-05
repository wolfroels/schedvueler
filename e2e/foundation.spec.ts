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

test.describe('PrimeUIX styling', () => {
  for (const theme of ['light', 'dark', 'auto']) {
    test(`optional tokens and fallbacks in ${theme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await open(page, { view: 'timeline' }, { theme })
      const root = page.locator('.schedvueler')
      const original = await root.evaluate((element) => {
        const style = getComputedStyle(element)
        return { background: style.backgroundColor, color: style.color }
      })
      const tokens = await page.addStyleTag({
        content: `
        :root {
          --p-content-background: #f0fdf4;
          --p-text-color: #14532d;
          --p-primary-color: #16a34a;
          --p-content-border-color: #86efac;
          --p-content-border-radius: 4px;
        }
      `,
      })
      await expect(root).toHaveCSS('background-color', original.background)
      const bridge = await page.addStyleTag({ path: 'src/styles/primeuix.css' })
      await expect(root).toHaveCSS('background-color', 'rgb(240, 253, 244)')
      await expect(root).toHaveCSS('color', 'rgb(20, 83, 45)')
      await expect(page.locator('.orb-tl')).toHaveCSS('border-top-color', 'rgb(134, 239, 172)')
      await expect(page.locator('.orb-tl')).toHaveCSS('border-top-left-radius', '4px')
      await tokens.evaluate((element) => {
        element.textContent = ':root { --p-content-background: #052e16; --p-text-color: #dcfce7; }'
      })
      await expect(root).toHaveCSS('background-color', 'rgb(5, 46, 22)')
      await expect(root).toHaveCSS('color', 'rgb(220, 252, 231)')
      await root.evaluate((element: HTMLElement) =>
        element.style.setProperty('--orb-color-bg', '#ff0000'),
      )
      await expect(root).toHaveCSS('background-color', 'rgb(255, 0, 0)')
      await root.evaluate((element: HTMLElement) => element.style.removeProperty('--orb-color-bg'))
      await tokens.evaluate((element) => element.parentNode?.removeChild(element))
      await expect(root).toHaveCSS('background-color', original.background)
      await expect(root).toHaveCSS('color', original.color)
      await bridge.evaluate((element) => element.parentNode?.removeChild(element))
      await expect(root).toHaveCSS('background-color', original.background)
    })
  }
})

test.describe('visual presets', () => {
  const presets = [
    ['default', '8px'],
    ['modern', '6px'],
    ['glass', '16px'],
    ['glassmorphism', '16px'],
    ['neumorphic', '14px'],
    ['clean', '4px'],
    ['bento', '16px'],
    ['neo-brutalism', '0'],
    ['cyber-y2k', '4px'],
  ] as const

  for (const [preset, radius] of presets) {
    test(`${preset} preset keeps dark color mode independent`, async ({ page }) => {
      await open(page, { view: 'week' }, { preset, theme: 'dark' })
      const root = page.locator('.schedvueler')
      await expect(root).toHaveAttribute('data-preset', preset)
      await expect(root).toHaveAttribute('data-theme', 'dark')
      await expect(root).toHaveCSS('color-scheme', 'dark')
      expect(
        await root.evaluate((element) =>
          getComputedStyle(element).getPropertyValue('--orb-radius').trim(),
        ),
      ).toBe(radius)
    })
  }

  test('auto mode keeps a light palette when the system is light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await open(page, { view: 'week' }, { preset: 'modern', theme: 'auto' })
    await expect(page.locator('.schedvueler')).toHaveCSS('background-color', 'rgb(244, 247, 251)')
  })

  test('presets continue to consume optional PrimeUIX tokens', async ({ page }) => {
    await open(page, { view: 'week' }, { preset: 'modern' })
    const root = page.locator('.schedvueler')
    await page.addStyleTag({
      content: ':root { --p-content-background: #f0fdf4; --p-text-color: #14532d; }',
    })
    await page.addStyleTag({ path: 'src/styles/primeuix.css' })
    await expect(root).toHaveCSS('background-color', 'rgb(240, 253, 244)')
    await expect(root).toHaveCSS('color', 'rgb(20, 83, 45)')
  })
})

test.describe('saved preferences', () => {
  test('restores zoom and keeps widths when switching views', async ({ page }) => {
    await open(
      page,
      {
        view: 'timeline',
        tl: JSON.stringify({
          zoomLevels: [
            { slotDuration: 60, slotWidth: 40 },
            { slotDuration: 30, slotWidth: 80 },
          ],
        }),
      },
      { storageKey: 'scheduler-zoom' },
    )
    await page.locator('[data-orb-part="resourceResizer"]').focus()
    await page.keyboard.press('ArrowRight')
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await page.getByRole('button', { name: 'Month', exact: true }).click()
    await page.getByRole('button', { name: 'Timeline', exact: true }).click()
    await expect(page.locator('.orb-tl__corner')).toHaveCSS('width', '202px')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled()
    await expect(page.locator('.orb-tl__corner')).toHaveCSS('width', '202px')
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('scheduler-zoom')!)
      saved.timelines.timeline.zoom = 99
      localStorage.setItem('scheduler-zoom', JSON.stringify(saved))
    })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled()
  })

  for (const saved of [
    'invalid JSON',
    JSON.stringify({
      version: 1,
      date: 'invalid',
      timelines: { timeline: { resourceAreaWidth: -5, zoom: -2 } },
    }),
    JSON.stringify({ version: 99 }),
  ]) {
    test(`ignores invalid preferences: ${saved}`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('invalid-preferences', value), saved)
      await open(page, { view: 'timeline' }, { storageKey: 'invalid-preferences' })
      await expect(page.locator('.orb-tl__corner')).toHaveCSS('width', '192px')
      await page.getByRole('button', { name: 'Month', exact: true }).click()
      await expect(page.locator('[data-orb-part="monthGrid"]')).toBeVisible()
    })
  }

  test('clamps a restored width to the available viewport', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'wide-preferences',
        JSON.stringify({
          version: 1,
          view: 'timeline',
          timelines: { timeline: { resourceAreaWidth: 5000 } },
        }),
      ),
    )
    await open(page, {}, { storageKey: 'wide-preferences' })
    const maximum = await page.locator('.orb-tl').evaluate((element) => element.clientWidth - 80)
    await expect(page.locator('.orb-tl__corner')).toHaveCSS('width', `${maximum}px`)
  })

  test('works when localStorage is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Blocked', 'SecurityError')
        },
      })
    })
    await open(page, { view: 'timeline' }, { storageKey: 'blocked-preferences' })
    await page.locator('[data-orb-part="resourceResizer"]').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.orb-tl__corner')).toHaveCSS('width', '202px')
    await page.evaluate(() =>
      (
        window as unknown as { orbScheduler: { value: { clearStorage(): void } } }
      ).orbScheduler.value.clearStorage(),
    )
  })

  test('does not store preferences without a storage key', async ({ page }) => {
    await open(page, { view: 'timeline' })
    await page.locator('[data-orb-part="resourceResizer"]').focus()
    await page.keyboard.press('ArrowRight')
    await page.getByRole('button', { name: 'Month', exact: true }).click()
    expect(await page.evaluate(() => localStorage.length)).toBe(0)
  })

  test('restores view, date, and timeline width, and clears only its own storage', async ({
    page,
  }) => {
    await open(page, { view: 'timeline' }, { storageKey: 'scheduler-preferences' })
    await page.evaluate(() => localStorage.setItem('unrelated', 'keep'))
    const splitter = page.locator('[data-orb-part="resourceResizer"]')
    await splitter.focus()
    await page.keyboard.press('ArrowRight')
    const width = await page
      .locator('.orb-tl__corner')
      .evaluate((element) => element.getBoundingClientRect().width)
    await page.locator('[data-orb-part="nextButton"]').click()
    const title = await page.locator('[data-orb-part="title"]').textContent()
    await page.reload()
    await expect(page.locator('.orb-tl__corner')).toHaveCSS('width', `${width}px`)
    await expect(page.locator('[data-orb-part="title"]')).toHaveText(title!)
    await page.getByRole('button', { name: 'Month', exact: true }).click()
    await page.reload()
    await expect(page.locator('[data-orb-part="monthGrid"]')).toBeVisible()
    await page.evaluate(() => {
      const scheduler = (window as unknown as { orbScheduler: { value: { clearStorage(): void } } })
        .orbScheduler
      scheduler.value.clearStorage()
    })
    expect(await page.evaluate(() => localStorage.getItem('scheduler-preferences'))).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('unrelated'))).toBe('keep')
    await expect(page.locator('[data-orb-part="monthGrid"]')).toBeVisible()
    await page.reload()
    await expect(page.locator('.orb-tl__corner')).toHaveCSS('width', '192px')
  })
})

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
        await expect(page.locator('.schedvueler')).toHaveScreenshot(`${view}-${theme}.png`, {
          maxDiffPixelRatio: 0.01,
          animations: 'disabled',
        })
      })
    }
  }
})
