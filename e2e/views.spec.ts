import { event, expect, open, test } from './helpers'

for (const view of ['day', 'three', 'week', 'agenda', 'rooms', 'timeline', 'month']) {
  test(`${view} view shows its events without errors`, async ({ page }) => {
    await open(page, { view })
    await expect(event(page, 'Alpha')).toBeVisible()
  })
}

test('year view shows months without errors', async ({ page }) => {
  await open(page, { view: 'year' })
  await expect(page.locator('[data-orb-part="yearMonth"]')).toHaveCount(12)
})

test('the playground opens every view from the switcher', async ({ page }) => {
  await page.goto('/')
  const buttons = page.locator('[data-orb-part="viewButton"]')
  await expect(buttons.first()).toBeVisible()
  for (let i = 0; i < (await buttons.count()); i++) {
    await buttons.nth(i).click()
    await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'true')
  }
})

test('the slots and parts page shows a live scheduler', async ({ page }) => {
  await page.goto('/#/parts')
  await expect(page.locator('[data-orb-part="root"]')).toBeVisible()
  await expect(page.locator('[data-orb-part="event"]').first()).toBeVisible()
  await expect(page.getByText('todayButton').first()).toBeVisible()
})
