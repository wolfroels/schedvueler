import { cell, event, expect, logged, open, test } from './helpers'

// The fixture logs every right-click and calls preventDefault, as an app with its own menu does.

test('right-clicking an event, a slot and a day header', async ({ page }) => {
  await open(page)
  await event(page, 'Alpha').click({ button: 'right' })
  await cell(page, 2, 30).click({ button: 'right' })
  await page.locator('[data-orb-part="dayHeader"] button').nth(3).click({ button: 'right' })
  const log = await logged(page)
  expect(log).toContain('event-contextmenu Alpha')
  expect(log).toContain('slot-contextmenu 2026-06-17T15:00:00')
  expect(log).toContain('date-contextmenu 2026-06-18')
  // A right-click is not a click: nothing opens, nothing is selected.
  expect(log.some((l) => l.startsWith('event-click') || l.startsWith('date-click'))).toBe(false)
})

test('right-clicking a month day number', async ({ page }) => {
  await open(page, { view: 'month' })
  await page.locator('[data-orb-part="monthDayNumber"]', { hasText: /^10$/ }).first().click({
    button: 'right',
  })
  expect(await logged(page)).toContain('date-contextmenu 2026-06-10')
})

test('right-clicking a resource, on a timeline and as a column header', async ({ page }) => {
  await open(page, { view: 'timeline' })
  await page.locator('[data-orb-part="resourceLabel"]').first().click({ button: 'right' })
  expect((await logged(page)).join()).toMatch(/resource-contextmenu \w+/)

  await open(page, { view: 'rooms' })
  await page.locator('[data-orb-part="resourceHeader"]').first().click({ button: 'right' })
  expect(await logged(page)).toContain('resource-contextmenu r1')
})

test('the menu key on a focused event', async ({ page, browserName }) => {
  // Only Chromium turns a synthetic Shift+F10 into a contextmenu event; Firefox and WebKit open
  // their menu from the real key only, and macOS has no menu key at all.
  test.skip(browserName !== 'chromium', 'Synthetic Shift+F10 opens no menu in this browser')
  await open(page)
  await event(page, 'Alpha').focus()
  await page.keyboard.press('Shift+F10')
  expect(await logged(page)).toContain('event-contextmenu Alpha')
})
