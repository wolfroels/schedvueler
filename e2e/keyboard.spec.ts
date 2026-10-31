import { cell, dateCell, event, expect, logged, open, test } from './helpers'

test.describe('events', () => {
  test.beforeEach(({ page }) => open(page))

  test('Alt + arrows move an event and keep the focus on it', async ({ page }) => {
    await event(page, 'Alpha').focus()
    await page.keyboard.press('Alt+ArrowDown')
    expect(await logged(page)).toContain(
      'event-drop Alpha 2026-06-15T09:30:00 2026-06-15T10:30:00 @r1',
    )
    await expect(event(page, 'Alpha')).toBeFocused()
    await page.keyboard.press('Alt+ArrowRight')
    expect(await logged(page)).toContain(
      'event-drop Alpha 2026-06-16T09:30:00 2026-06-16T10:30:00 @r1',
    )
    await expect(event(page, 'Alpha')).toBeFocused()
  })

  test('Alt + Shift + arrows resize the end', async ({ page }) => {
    await event(page, 'Alpha').focus()
    await page.keyboard.press('Alt+Shift+ArrowDown')
    expect(await logged(page)).toContain(
      'event-resize Alpha 2026-06-15T09:00:00 2026-06-15T10:30:00 @r1',
    )
  })

  test('Enter clicks and Delete deletes', async ({ page }) => {
    await event(page, 'Alpha').focus()
    await page.keyboard.press('Enter')
    expect(await logged(page)).toContain('event-click Alpha')
    await page.keyboard.press('Delete')
    expect(await logged(page)).toContain('event-delete Alpha')
    await expect(event(page, 'Alpha')).toHaveCount(0)
  })
})

test('the agenda deletes and moves from the keyboard', async ({ page }) => {
  await open(page, { view: 'agenda' })
  await event(page, 'Alpha').focus()
  await page.keyboard.press('Alt+ArrowRight')
  expect(await logged(page)).toContain(
    'event-drop Alpha 2026-06-16T09:00:00 2026-06-16T10:00:00 @r1',
  )
  await event(page, 'Beta').focus()
  await page.keyboard.press('Delete')
  expect(await logged(page)).toContain('event-delete Beta')
})

test('RTL: Alt + left goes forward in time', async ({ page }) => {
  await open(page, { rtl: '1' })
  await event(page, 'Alpha').focus()
  await page.keyboard.press('Alt+ArrowLeft')
  expect(await logged(page)).toContain(
    'event-drop Alpha 2026-06-16T09:00:00 2026-06-16T10:00:00 @r1',
  )
})

test('Shift + arrows and Enter select slots', async ({ page }) => {
  await open(page)
  await cell(page, 1, 20).focus()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Enter')
  expect(await logged(page)).toContain('select 2026-06-16T10:00:00 2026-06-16T11:30:00 @')
})

test('arrows walk the grid and past its edge to the next week', async ({ page }) => {
  await open(page)
  await cell(page, 6, 20).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(cell(page, 5, 20)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(cell(page, 0, 20)).toBeFocused()
  expect(
    (await logged(page)).some((l) => l.startsWith('navigate') && l.includes('2026-06-22')),
  ).toBe(true)
})

test('PageDown, PageUp and T navigate; Alt + a number switches views', async ({ page }) => {
  await open(page)
  await cell(page, 0, 20).focus()
  await page.keyboard.press('PageDown')
  await expect(page.locator('[data-orb-part="title"]')).toContainText('22')
  await page.keyboard.press('PageUp')
  await expect(page.locator('[data-orb-part="title"]')).toContainText('15')
  await page.keyboard.press('t')
  expect((await logged(page)).some((l) => l.startsWith('navigate'))).toBe(true)
  await page.keyboard.press('Alt+4')
  expect(await logged(page)).toContain('view-change month')
  await expect(page.locator('[data-orb-part="monthGrid"]')).toBeVisible()
})

test('month cells: arrows move the focus and Enter clicks the cell', async ({ page }) => {
  await open(page, { view: 'month' })
  await dateCell(page, '2026-06-10').focus()
  await page.keyboard.press('ArrowRight')
  await expect(dateCell(page, '2026-06-11')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(dateCell(page, '2026-06-18')).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await logged(page)).toContain('slot-click 2026-06-18')
})

test('year days: arrows move the focus', async ({ page }) => {
  await open(page, { view: 'year' })
  await dateCell(page, '2026-06-10').focus()
  await page.keyboard.press('ArrowRight')
  await expect(dateCell(page, '2026-06-11')).toBeFocused()
})
