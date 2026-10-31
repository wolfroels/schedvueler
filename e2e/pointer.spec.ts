import {
  cell,
  center,
  dateCell,
  drag,
  event,
  expect,
  logged,
  moveTo,
  open,
  press,
  test,
} from './helpers'

test.describe('week view', () => {
  test.beforeEach(({ page }) => open(page))

  test('moves an event to another day and time', async ({ page }) => {
    await drag(page, cell(page, 0, 18), cell(page, 2, 22))
    expect(await logged(page)).toContain(
      'event-drop Alpha 2026-06-17T11:00:00 2026-06-17T12:00:00 @r1',
    )
    await expect(event(page, 'Alpha')).toContainText('11:00')
  })

  test('moves earlier on a later day, and later on an earlier day', async ({ page }) => {
    await drag(page, cell(page, 2, 18), cell(page, 3, 16))
    expect(await logged(page)).toContain(
      'event-drop Beta 2026-06-18T08:00:00 2026-06-18T09:00:00 @',
    )
    await drag(page, cell(page, 3, 16), cell(page, 1, 20))
    expect(await logged(page)).toContain(
      'event-drop Beta 2026-06-16T10:00:00 2026-06-16T11:00:00 @',
    )
  })

  test('resizes the end and the start of an event', async ({ page }) => {
    const alpha = event(page, 'Alpha')
    await drag(page, alpha.locator('.orb-event__resizer--end'), cell(page, 0, 23))
    expect(await logged(page)).toContain(
      'event-resize Alpha 2026-06-15T09:00:00 2026-06-15T12:00:00 @r1',
    )
    await drag(page, alpha.locator('.orb-event__resizer--start'), cell(page, 0, 16))
    expect(await logged(page)).toContain(
      'event-resize Alpha 2026-06-15T08:00:00 2026-06-15T12:00:00 @r1',
    )
  })

  test('selects a range of slots', async ({ page }) => {
    await drag(page, cell(page, 1, 20), cell(page, 1, 23))
    expect(await logged(page)).toContain('select 2026-06-16T10:00:00 2026-06-16T12:00:00 @')
    await expect(page.locator('[data-orb-part="selection"]')).toBeVisible()
  })

  test('a click is not a drag', async ({ page }) => {
    await event(page, 'Alpha').click()
    const log = await logged(page)
    expect(log).toContain('event-click Alpha')
    expect(log.filter((l) => l.startsWith('event-drag-start'))).toEqual([])
  })

  test('a drag is not a click', async ({ page }) => {
    await drag(page, cell(page, 0, 18), cell(page, 0, 20))
    expect(await logged(page)).not.toContain('event-click Alpha')
  })

  test('Escape cancels a drag', async ({ page }) => {
    await press(page, cell(page, 0, 18))
    await moveTo(page, cell(page, 2, 22))
    await expect(page.locator('.orb-event--mirror')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.orb-event--mirror')).toHaveCount(0)
    await page.mouse.up()
    const log = await logged(page)
    expect(log).toContain('event-drag-cancel Alpha escape')
    expect(log.join()).not.toContain('event-drop')
  })

  test('letting go outside the scheduler cancels', async ({ page }) => {
    await press(page, cell(page, 0, 18))
    await moveTo(page, cell(page, 2, 22))
    // The toolbar row above the frame is off every view.
    await moveTo(page, { x: 640, y: 2 })
    await page.mouse.up()
    expect(await logged(page)).toContain('event-drag-cancel Alpha outside')
  })

  test('scrolls near the bottom edge while dragging', async ({ page }) => {
    const scroller = page.locator('.orb-tg__scroller')
    const box = await scroller.boundingBox()
    const before = await scroller.evaluate((el) => el.scrollTop)
    await press(page, cell(page, 0, 18))
    await moveTo(page, { x: box!.x + box!.width / 2, y: box!.y + box!.height - 8 })
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 50)
    await page.mouse.up()
    expect((await logged(page)).some((l) => l.startsWith('event-drop Alpha'))).toBe(true)
  })

  test('takes an event dragged in from outside', async ({ page }) => {
    await drag(page, page.locator('.fixture-template'), cell(page, 3, 20))
    expect(await logged(page)).toContain(
      'event-receive Dropped 2026-06-18T10:00:00 2026-06-18T11:00:00',
    )
  })

  test('edits one occurrence of a recurring event', async ({ page }) => {
    await expect(event(page, 'Standup')).toHaveCount(3)
    await drag(page, cell(page, 4, 26), cell(page, 4, 22))
    expect(await logged(page)).toContain(
      'event-drop Standup 2026-06-19T11:00:00 2026-06-19T11:30:00 @',
    )
    await expect(event(page, 'Standup')).toHaveCount(3)
    await expect(event(page, 'Standup').filter({ hasText: '11:00' })).toHaveCount(1)
    await expect(event(page, 'Standup').filter({ hasText: '13:00' })).toHaveCount(2)
  })

  test('shows every event once when a slot is added and removed later', async ({ page }) => {
    await expect(page.locator('.fixture-slot')).toHaveCount(0)
    await page.locator('.fixture-toggle').click()
    await expect(page.locator('.fixture-slot', { hasText: 'Slot Alpha' })).toBeVisible()
    await expect(event(page, 'Alpha').locator('.orb-event__time')).toHaveCount(0)
    await page.locator('.fixture-toggle').click()
    await expect(page.locator('.fixture-slot')).toHaveCount(0)
    await expect(event(page, 'Alpha').locator('.orb-event__time')).toHaveCount(1)
  })

  test('passes attributes through with pt', async ({ page }) => {
    await expect(page.locator('[data-orb-part="todayButton"]')).toHaveClass(/fixture-today/)
    await expect(page.locator('[data-orb-part="dayHeader"][data-fixture-date]')).toHaveCount(7)
  })
})

test('refuses a drop that canDrop rejects', async ({ page }) => {
  await open(page, { blockWeekends: '1' })
  await press(page, cell(page, 0, 18))
  await moveTo(page, cell(page, 5, 18))
  await expect(page.locator('.orb-event--invalid')).toBeVisible()
  await page.mouse.up()
  const log = await logged(page)
  expect(log).toContain('event-drag-cancel Alpha invalid')
  expect(log.join()).not.toContain('event-drop')
})

test('N-day views count visible days and skip hidden ones', async ({ page }) => {
  await open(page, { view: 'three', date: '2026-06-19', hidden: '6,7' })
  await expect(page.locator('[data-orb-part="dayHeader"]')).toHaveCount(3)
  const dates = await page
    .locator('[data-orb-part="dayHeader"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-fixture-date')))
  expect(dates).toEqual(['2026-06-19', '2026-06-22', '2026-06-23'])
})

test.describe('month view', () => {
  test.beforeEach(({ page }) => open(page, { view: 'month' }))

  test('moves a timed event and keeps its time', async ({ page }) => {
    await drag(page, event(page, 'Alpha'), dateCell(page, '2026-06-24'))
    expect(await logged(page)).toContain(
      'event-drop Alpha 2026-06-24T09:00:00 2026-06-24T10:00:00 @r1',
    )
  })

  test('selects days', async ({ page }) => {
    await drag(page, dateCell(page, '2026-06-08'), dateCell(page, '2026-06-09'))
    expect((await logged(page)).some((l) => l.startsWith('select 2026-06-08'))).toBe(true)
  })

  test('resizes an all-day event', async ({ page }) => {
    const holiday = event(page, 'Holiday')
    await drag(page, holiday.locator('.orb-event__resizer--end'), dateCell(page, '2026-06-18'))
    expect((await logged(page)).some((l) => l.startsWith('event-resize Holiday 2026-06-16'))).toBe(
      true,
    )
  })

  test('opens the overflow popover, drags from it, and it closes', async ({ page }) => {
    await page.locator('[data-orb-part="moreLink"]').first().click()
    const popover = page.locator('[data-orb-part="popover"]')
    await expect(popover).toBeVisible()
    await drag(
      page,
      popover.locator('[data-orb-part="event"]').last(),
      dateCell(page, '2026-06-24'),
    )
    await expect(popover).toHaveCount(0)
    // The popover covers other days; the event still counts from the day it is listed under.
    expect(await logged(page)).toContain(
      'event-drop Busy 7 2026-06-24T17:00:00 2026-06-24T17:30:00 @',
    )
  })
})

test.describe('resources', () => {
  test('moves an event to another resource column', async ({ page }) => {
    await open(page, { view: 'rooms' })
    await drag(page, cell(page, 0, 18), cell(page, 1, 20))
    expect(await logged(page)).toContain(
      'event-drop Alpha 2026-06-15T10:00:00 2026-06-15T11:00:00 @r2',
    )
  })

  test('moves an event along and between timeline rows', async ({ page }) => {
    await open(page, { view: 'timeline' })
    const alpha = event(page, 'Alpha')
    const lanes = page.locator('[data-orb-part="timelineLane"]')
    const start = await center(alpha)
    const row = await center(lanes.nth(1))
    const box = await alpha.boundingBox()
    await drag(page, alpha, { x: start.x + box!.width, y: row.y })
    const drop = (await logged(page)).find((l) => l.startsWith('event-drop Alpha'))
    expect(drop).toMatch(/2026-06-15T10:00:00 2026-06-15T11:00:00 @r2$/)
  })
})

test('RTL: dragging towards the left goes forward in time', async ({ page }) => {
  await open(page, { rtl: '1' })
  const first = await center(cell(page, 0, 18))
  const second = await center(cell(page, 1, 18))
  expect(second.x).toBeLessThan(first.x)
  await drag(page, cell(page, 0, 18), cell(page, 1, 18))
  expect(await logged(page)).toContain(
    'event-drop Alpha 2026-06-16T09:00:00 2026-06-16T10:00:00 @r1',
  )
})
