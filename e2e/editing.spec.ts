import { cell, center, dateCell, drag, event, expect, logged, open, test } from './helpers'

const SELECT = { eventSelection: true }

test.describe('selected events', () => {
  test('click, Ctrl + click and Shift + click', async ({ page }) => {
    await open(page, {}, SELECT)
    await event(page, 'Alpha').click()
    await expect(event(page, 'Alpha')).toHaveClass(/orb-event--selected/)
    await event(page, 'Beta').click({ modifiers: ['ControlOrMeta'] })
    await expect(page.locator('.orb-event--selected')).toHaveCount(2)
    await event(page, 'Beta').click()
    await expect(page.locator('.orb-event--selected')).toHaveCount(1)
    await event(page, 'Alpha').click()
    await event(page, 'Standup')
      .first()
      .click({ modifiers: ['Shift'] })
    // Alpha, Beta and the first Standup, in time order.
    await expect(page.locator('.orb-event--selected')).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect(page.locator('.orb-event--selected')).toHaveCount(0)
  })

  test('Shift + drag draws a marquee around events', async ({ page }) => {
    await open(page, {}, SELECT)
    const a = await center(cell(page, 0, 16))
    const b = await center(cell(page, 2, 21))
    await page.keyboard.down('Shift')
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 4 })
    await expect(page.locator('[data-orb-part="marquee"]')).toBeVisible()
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect(page.locator('[data-orb-part="marquee"]')).toHaveCount(0)
    await expect(event(page, 'Alpha')).toHaveClass(/orb-event--selected/)
    await expect(event(page, 'Beta')).toHaveClass(/orb-event--selected/)
    await expect(event(page, 'Standup').first()).not.toHaveClass(/orb-event--selected/)
  })

  test('moves and deletes the selection together', async ({ page }) => {
    await open(page, {}, SELECT)
    await event(page, 'Alpha').click()
    await event(page, 'Beta').click({ modifiers: ['ControlOrMeta'] })
    await drag(page, cell(page, 0, 18), cell(page, 1, 20))
    const log = await logged(page)
    expect(log).toContain('event-drop Alpha 2026-06-16T10:00:00 2026-06-16T11:00:00 @r1')
    expect(log).toContain('event-drop+ Beta 2026-06-18T10:00:00 2026-06-18T11:00:00')
    await event(page, 'Beta').focus()
    await page.keyboard.press('Delete')
    await expect(event(page, 'Alpha')).toHaveCount(0)
    await expect(event(page, 'Beta')).toHaveCount(0)
  })
})

test.describe('clipboard', () => {
  test('copies to the slot in focus', async ({ page }) => {
    await open(page, {}, { eventClipboard: true })
    await event(page, 'Alpha').focus()
    await page.keyboard.press('ControlOrMeta+c')
    expect(await logged(page)).toContain('events-copy 1 false')
    await cell(page, 3, 20).focus()
    await page.keyboard.press('ControlOrMeta+v')
    expect(await logged(page)).toContain('events-paste 2026-06-18T10:00:00 2026-06-18T11:00:00')
    await expect(event(page, 'Alpha')).toHaveCount(2)
  })

  test('cut moves the original', async ({ page }) => {
    await open(page, {}, { eventClipboard: true })
    await event(page, 'Alpha').focus()
    await page.keyboard.press('ControlOrMeta+x')
    await cell(page, 3, 20).focus()
    await page.keyboard.press('ControlOrMeta+v')
    await expect(event(page, 'Alpha')).toHaveCount(1)
    await expect(event(page, 'Alpha')).toContainText('10:00')
  })
})

test('Ctrl + drag duplicates', async ({ page }) => {
  await open(page, {}, { dragToDuplicate: true })
  const from = await center(cell(page, 0, 18))
  const to = await center(cell(page, 1, 20))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.keyboard.down('ControlOrMeta')
  await page.mouse.move(to.x + 1, to.y)
  await page.mouse.up()
  await page.keyboard.up('ControlOrMeta')
  expect(await logged(page)).toContain(
    'event-duplicate Alpha 2026-06-16T10:00:00 2026-06-16T11:00:00',
  )
  await expect(event(page, 'Alpha')).toHaveCount(2)
})

test.describe('keyboard', () => {
  test('Alt + Ctrl + arrows resize the start', async ({ page, browserName }) => {
    await open(page)
    await event(page, 'Alpha').focus()
    await page.keyboard.press('Control+Alt+ArrowUp')
    expect(await logged(page)).toContain(
      'event-resize Alpha 2026-06-15T08:30:00 2026-06-15T10:00:00 @r1',
    )
    expect(browserName).toBeTruthy()
  })

  test('N creates at the slot in focus', async ({ page }) => {
    await open(page)
    await cell(page, 1, 20).focus()
    await page.keyboard.press('n')
    expect(await logged(page)).toContain('select 2026-06-16T10:00:00 2026-06-16T10:30:00 @')
  })

  test('N creates on the day in focus', async ({ page }) => {
    await open(page, { view: 'month' })
    await dateCell(page, '2026-06-10').focus()
    await page.keyboard.press('n')
    expect((await logged(page)).join()).toContain('select 2026-06-10 2026-06-11 all-day')
  })

  test('Tab goes from the toolbar into the grid and on to events', async ({ page }) => {
    await open(page)
    await page.locator('[data-orb-part="viewButton"]').last().focus()
    await page.keyboard.press('Tab')
    const first = await page.evaluate(() => document.activeElement?.getAttribute('data-orb-part'))
    expect(['dayHeader', 'event', 'timeSlot', null]).toContain(first)
    const parts = new Set<string | null | undefined>()
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      parts.add(await page.evaluate(() => document.activeElement?.getAttribute('data-orb-part')))
    }
    expect(parts).toContain('event')
    expect(parts).toContain('timeSlot')
  })

  test('picks up an outside event with Enter and puts it down on a slot', async ({ page }) => {
    await open(page)
    await page.locator('.fixture-template').focus()
    await page.keyboard.press('Enter')
    await cell(page, 3, 20).focus()
    await page.keyboard.press('Enter')
    expect(await logged(page)).toContain(
      'event-receive Dropped 2026-06-18T10:00:00 2026-06-18T11:00:00',
    )
  })
})

test('an all-day round trip keeps the length', async ({ page }) => {
  await open(page)
  const allDay = page.locator('[data-orb-part="allDayCell"]').nth(0)
  await drag(page, cell(page, 0, 18), allDay)
  await expect(event(page, 'Alpha').locator('.orb-event__time')).toHaveCount(0)
  await drag(page, event(page, 'Alpha'), cell(page, 0, 20))
  const drops = (await logged(page)).filter((l) => l.startsWith('event-drop Alpha'))
  expect(drops.at(-1)).toContain('2026-06-15T10:00:00 2026-06-15T11:00:00')
})

test('dragging off the scheduler emits event-leave', async ({ page }) => {
  await open(page, {}, { eventLeave: true })
  await drag(page, cell(page, 0, 18), { x: 640, y: 2 })
  expect(await logged(page)).toContain('event-leave Alpha false')
})

test('accepts native drops', async ({ page }) => {
  await open(page, {}, { nativeDrop: true })
  const target = cell(page, 1, 20)
  const { x, y } = await center(target)
  await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y)!
      const init = { bubbles: true, cancelable: true, clientX: x, clientY: y }
      el.dispatchEvent(new DragEvent('dragover', init))
      el.dispatchEvent(new DragEvent('drop', init))
    },
    { x, y },
  )
  expect((await logged(page)).join()).toContain('native-drop 2026-06-16T10:00:00')
})
