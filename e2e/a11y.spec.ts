import AxeBuilder from '@axe-core/playwright'
import { cell, center, dateCell, event, expect, logged, open, test } from './helpers'

const VIEWS = [
  'day',
  'week',
  'month',
  'year',
  'agenda',
  'rooms',
  'timeline',
  'planner',
  'gantt',
  'multi-month',
]

for (const view of VIEWS) {
  for (const theme of ['light', 'dark']) {
    test(`${view}, ${theme}: no automatically detectable problems`, async ({ page }) => {
      await open(page, { view }, { theme, businessHours: { start: '09:00', end: '17:00' } })
      const results = await new AxeBuilder({ page })
        .include('.orb-scheduler')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      const summary = results.violations.map(
        (v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target} (${v.nodes[0]?.failureSummary})`,
      )
      expect(summary).toEqual([])
    })
  }
}

test('time slots say their date and time', async ({ page }) => {
  await open(page)
  await expect(page.locator('[role="grid"]')).toHaveCount(1)
  await expect(cell(page, 0, 18)).toHaveAttribute('role', 'gridcell')
  const label = await cell(page, 0, 18).getAttribute('aria-label')
  expect(label).toContain('15 June')
  expect(label).toContain('09:00')
})

test.describe('moving without dragging', () => {
  const OPTS = { clickToMove: true }

  test('click an event, then click where it goes', async ({ page }) => {
    await open(page, {}, OPTS)
    await event(page, 'Alpha').click()
    await expect(event(page, 'Alpha')).toHaveClass(/orb-event--armed/)
    await cell(page, 2, 22).click()
    expect(await logged(page)).toContain(
      'event-drop Alpha 2026-06-17T11:00:00 2026-06-17T12:00:00 @r1',
    )
    await expect(page.locator('.orb-event--armed')).toHaveCount(0)
  })

  test('Escape cancels', async ({ page }) => {
    await open(page, {}, OPTS)
    await event(page, 'Alpha').click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.orb-event--armed')).toHaveCount(0)
    await cell(page, 2, 22).click()
    expect((await logged(page)).join()).not.toContain('event-drop')
  })

  test('in the month, and with the rules', async ({ page }) => {
    await open(page, { view: 'month' }, { ...OPTS, maxDate: '2026-06-30' })
    await event(page, 'Alpha').click()
    await dateCell(page, '2026-06-24').click()
    expect((await logged(page)).join()).toContain('event-drop Alpha 2026-06-24T09:00:00')
    await event(page, 'Alpha').click()
    await dateCell(page, '2026-07-02').click()
    expect(await logged(page)).toContain('event-change-failed Alpha date-limit')
  })

  test('on a timeline', async ({ page }) => {
    await open(page, { view: 'timeline' }, OPTS)
    await event(page, 'Alpha').click()
    const lane = page.locator('[data-orb-part="timelineLane"]').nth(1)
    const from = await center(event(page, 'Alpha'))
    const y = (await center(lane)).y
    await page.mouse.click(from.x, y)
    expect((await logged(page)).join()).toMatch(/event-drop Alpha .*@r2/)
  })

  test('resizes through the API', async ({ page }) => {
    await open(page, {}, OPTS)
    await page.evaluate(() => {
      const { value } = (window as unknown as { orbScheduler: { value: unknown } }).orbScheduler
      const ctx = (
        value as {
          context: {
            occurrences: { value: { key: string }[] }
            interaction: { armMove(o: unknown, k: string): void }
          }
        }
      ).context
      ctx.interaction.armMove(
        ctx.occurrences.value.find((o) => o.key === 'alpha'),
        'resize-end',
      )
    })
    await cell(page, 0, 23).click()
    expect(await logged(page)).toContain(
      'event-resize Alpha 2026-06-15T09:00:00 2026-06-15T12:00:00 @r1',
    )
  })
})

test('a real right-to-left locale', async ({ page }) => {
  await open(page, { rtl: '1' }, { locale: 'ar-EG' })
  await expect(page.locator('.orb-scheduler')).toHaveCSS('direction', 'rtl')
  await expect(page.locator('[data-orb-part="dayHeader"]').first()).toContainText(/[؀-ۿ]/)
  await event(page, 'Alpha').focus()
  await page.keyboard.press('Alt+ArrowLeft')
  expect((await logged(page)).join()).toContain('event-drop Alpha 2026-06-16T09:00:00')
  await open(page, { rtl: '1', view: 'month' }, { locale: 'ar-EG' })
  await expect(page.locator('[data-orb-part="monthGrid"]')).toBeVisible()
  await open(page, { rtl: '1', view: 'timeline' }, { locale: 'he-IL' })
  await expect(event(page, 'Alpha')).toBeVisible()
})

test.describe('non-Gregorian calendars', () => {
  test('months follow the calendar', async ({ page }) => {
    // 15 June 2026 is 25 Khordad 1405; that month runs from 22 May to 21 June.
    await open(page, { view: 'month' }, { calendar: 'persian', locale: 'en-GB' })
    await expect(page.locator('[data-orb-part="title"]')).toContainText('Khordad')
    await expect(page.locator('[data-orb-part="title"]')).toContainText('1405')
    await expect(dateCell(page, '2026-06-21')).not.toHaveClass(/is-other-month/)
    await expect(dateCell(page, '2026-05-18')).toHaveClass(/is-other-month/)
    await expect(
      dateCell(page, '2026-05-22').locator('[data-orb-part="monthDayNumber"]'),
    ).toHaveText('1')
    await page.locator('[data-orb-part="nextButton"]').click()
    await expect(page.locator('[data-orb-part="title"]')).toContainText('Tir')
  })
})

test('the event order in a month can be set', async ({ page }) => {
  await open(page, { view: 'month', reverseMonth: '1' })
  const titles = await page
    .locator('[data-date="2026-06-11"]')
    .locator('xpath=ancestor::*[@data-orb-part="monthWeek"]')
    .locator('[data-orb-part="event"]')
    .allInnerTexts()
  expect(titles[0]).toContain('Busy 7')
})

test('forced colors keep events visible', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await open(page)
  await expect(event(page, 'Alpha')).toHaveCSS('border-top-style', 'solid')
})
