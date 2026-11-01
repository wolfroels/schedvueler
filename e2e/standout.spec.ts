import { cell, center, drag, event, expect, logged, moveTo, open, press, test } from './helpers'

test('filtering hides and dims without changing the data', async ({ page }) => {
  await open(page, { filter: 'Alpha' })
  await expect(event(page, 'Alpha')).toHaveClass(/orb-event--dimmed/)
  await expect(event(page, 'Beta')).not.toHaveClass(/orb-event--dimmed/)
})

test('marks conflicts', async ({ page }) => {
  await open(page, {}, { showConflicts: true }, [
    {
      id: 'x',
      title: 'Overlap',
      start: '2026-06-15T09:30:00',
      end: '2026-06-15T10:30:00',
      resourceId: 'r1',
    },
  ])
  await expect(event(page, 'Alpha').locator('[data-orb-part="conflict"]')).toBeVisible()
  await expect(event(page, 'Overlap')).toHaveClass(/orb-event--conflict/)
  await expect(event(page, 'Beta')).not.toHaveClass(/orb-event--conflict/)
})

test('the drag tooltip follows the drag', async ({ page }) => {
  await open(page, {}, { dragTooltip: true })
  await press(page, cell(page, 0, 18))
  await moveTo(page, cell(page, 2, 18))
  const tip = page.locator('[data-orb-part="dragTooltip"]')
  await expect(tip).toContainText('Wed')
  await expect(tip).toContainText('09:00')
  await expect(tip).toContainText('overlaps')
  await page.mouse.up()
  await expect(tip).toHaveCount(0)
})

test('buffers count for overlaps and are drawn', async ({ page }) => {
  await open(page, {}, { eventOverlap: 'forbid' }, [
    {
      id: 'b1',
      title: 'Buffered',
      start: '2026-06-18T10:00:00',
      end: '2026-06-18T11:00:00',
      bufferBefore: 30,
      bufferAfter: 30,
    },
  ])
  await expect(event(page, 'Buffered').locator('[data-orb-part="eventBuffer"]')).toHaveCount(2)
  // Beta at 09:00-10:00 next to it does not overlap the event, only its buffer.
  await drag(page, cell(page, 2, 18), cell(page, 3, 18))
  expect(await logged(page)).toContain('event-change-failed Beta overlap')
})

test('stacks open on a click', async ({ page }) => {
  const many = [0, 1, 2, 3].map((i) => ({
    id: `s${i}`,
    title: `Stack ${i}`,
    start: '2026-06-18T10:00:00',
    end: '2026-06-18T11:00:00',
  }))
  await open(page, { week: JSON.stringify({ eventStackThreshold: 3 }) }, {}, many)
  const stack = page.locator('[data-orb-part="eventStack"]')
  await expect(stack).toHaveText('4 events')
  await expect(event(page, 'Stack 0')).toHaveCount(0)
  await stack.click()
  await expect(event(page, 'Stack')).toHaveCount(4)
  await expect(stack).toHaveCount(0)
})

test.describe('folded hours', () => {
  const WEEK = { week: JSON.stringify({ foldEmptyHours: 120 }) }

  test('collapse what is empty and keep the times right', async ({ page }) => {
    await open(page, WEEK)
    const folds = page.locator('[data-orb-part="timeFold"]')
    // Midnight to 09:00, 10:00 to 13:00, and 13:30 to midnight, in each of seven columns.
    await expect(folds.first()).toContainText('00:00')
    expect(await folds.count()).toBe(7 * 3)
    await expect(event(page, 'Alpha')).toBeVisible()
    const box = (await event(page, 'Alpha').boundingBox())!
    const slot = (await page.locator('.orb-tg__slot:not(.is-fold)').first().boundingBox())!
    // An hour is still two slots.
    expect(box.height).toBeGreaterThan(slot.height * 1.8)
    expect(box.height).toBeLessThan(slot.height * 2.2)
  })

  test('dragging lands where it shows', async ({ page }) => {
    await open(page, WEEK)
    const alpha = event(page, 'Alpha')
    const from = await center(alpha)
    const box = (await alpha.boundingBox())!
    await drag(page, alpha, { x: from.x, y: from.y + box.height / 2 })
    expect((await logged(page)).join()).toContain('event-drop Alpha 2026-06-15T09:30:00')
  })
})

test('suggestions can be clicked', async ({ page }) => {
  await open(
    page,
    {},
    {
      suggestions: [{ start: '2026-06-16T10:00:00', end: '2026-06-16T11:00:00', title: 'Free' }],
    },
  )
  const s = page.locator('[data-orb-part="suggestion"]')
  await expect(s).toContainText('Free')
  await s.click()
  expect(await logged(page)).toContain('suggestion-click Free')
})

test('marks hours that suit several zones', async ({ page }) => {
  await open(
    page,
    {},
    {
      overlapZones: [
        { timeZone: 'Europe/Brussels', start: '09:00', end: '17:00' },
        { timeZone: 'America/New_York', start: '09:00', end: '17:00' },
      ],
    },
  )
  // 15:00 to 17:00 in Brussels, every day.
  const band = page.locator('[data-orb-part="timeZoneBand"]')
  expect(await band.count()).toBe(7)
  const height = await band.first().evaluate((el) => parseFloat((el as HTMLElement).style.height))
  expect(height).toBeCloseTo((2 / 24) * 100, 2)
})

test('shows who has an event open', async ({ page }) => {
  await open(page, {}, { presence: [{ id: 1, name: 'Sam', color: '#0a0', eventId: 'alpha' }] })
  await expect(event(page, 'Alpha').locator('[data-orb-part="presence"]')).toHaveText('S')
})

test('a custom keymap replaces shortcuts', async ({ page }) => {
  await open(page, {}, { keymap: { next: 'j', 'view:month': 'shift+m' } })
  await cell(page, 0, 18).focus()
  await page.keyboard.press('j')
  await expect(page.locator('[data-orb-part="title"]')).toContainText('22')
  await page.keyboard.press('PageDown')
  await expect(page.locator('[data-orb-part="title"]')).toContainText('22')
  await page.keyboard.press('Shift+M')
  await expect(page.locator('[data-orb-part="monthGrid"]')).toBeVisible()
})

test('density changes the size', async ({ page }) => {
  const height = async (density: string) => {
    await open(page, {}, { density })
    return (await cell(page, 0, 18).boundingBox())!.height
  }
  const compact = await height('compact')
  const comfortable = await height('comfortable')
  expect(comfortable).toBeGreaterThan(compact * 1.5)
})

test('animates moves, unless reduced motion is asked for', async ({ page, browserName }) => {
  test.skip(
    browserName === 'firefox' && !!process.env.PW_FIREFOX_CHANNEL,
    'The installed Firefox cannot emulate media features through Playwright',
  )
  await open(page, {}, { animate: true })
  const transition = () =>
    event(page, 'Alpha').evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(await transition()).not.toBe('0s')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await transition()).toBe('0s')
})

test('months darken with how busy a day is', async ({ page }) => {
  await open(page, { view: 'month' }, { dayUtilization: { capacity: 60 } })
  await expect(page.locator('[data-date="2026-06-15"]')).toHaveClass(/orb-month__cell--load-3/)
  await expect(page.locator('[data-date="2026-06-11"]')).toHaveClass(/orb-month__cell--load-4/)
})

test.describe('timeline extras', () => {
  test('minimap shows the view, and scrolls on a click', async ({ page }) => {
    await open(page, { view: 'timeline', tl: JSON.stringify({ period: 'month', minimap: true }) })
    const map = page.locator('[data-orb-part="minimap"]')
    await expect(map).toBeVisible()
    await expect(map.locator('.orb-tl__minimap-day')).toHaveCount(30)
    const box = (await map.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2)
    await expect
      .poll(() => page.locator('.orb-tl__scroller').evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(500)
  })

  test('zoom has buttons', async ({ page }) => {
    const zoomLevels = [
      { slotDuration: 60, slotWidth: 40 },
      { slotDuration: 30, slotWidth: 80 },
    ]
    await open(page, { view: 'timeline', tl: JSON.stringify({ zoomLevels }) })
    const control = page.locator('[data-orb-part="zoomControl"]')
    await control.getByRole('button', { name: 'Zoom in' }).click()
    expect((await logged(page)).join()).toContain('zoom-change 1')
    await expect(control.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
  })

  test('long bars keep their title in view', async ({ page }) => {
    await open(page, { view: 'timeline', tl: JSON.stringify({ period: 'month' }) }, {}, [
      { id: 'long', title: 'Long bar', start: '2026-06-02', end: '2026-06-28', resourceId: 'r1' },
    ])
    const title = event(page, 'Long bar').locator('.orb-event__title')
    await page.locator('.orb-tl__scroller').evaluate((el) => (el.scrollLeft = 1200))
    const corner = (await page.locator('[data-orb-part="timelineCorner"]').boundingBox())!
    await expect
      .poll(async () => (await title.boundingBox())!.x)
      .toBeGreaterThanOrEqual(corner.x + corner.width - 1)
    expect((await title.boundingBox())!.x).toBeLessThan(corner.x + corner.width + 40)
  })
})

test.describe('next to the scheduler', () => {
  const extras = '/e2e/fixture/?page=extras'

  test('the mini calendar navigates and marks busy days', async ({ page }) => {
    await page.goto(extras)
    const mini = page.locator('[data-orb-part="miniCalendar"]')
    await expect(mini.locator('[data-date="2026-06-15"]')).toHaveClass(/is-selected/)
    await expect(mini.locator('[data-date="2026-06-16"]')).toHaveClass(/is-busy/)
    await expect(mini.locator('[data-date="2026-06-20"]')).not.toHaveClass(/is-busy/)
    await mini.locator('[data-date="2026-06-23"]').click()
    await expect(page.locator('[data-orb-part="title"]')).toContainText('22')
  })

  test('the legend shows and hides layers', async ({ page }) => {
    await page.goto(extras)
    await expect(event(page, 'Beta')).toBeVisible()
    await page.getByLabel('Home').uncheck()
    await expect(event(page, 'Beta')).toHaveCount(0)
    await expect(event(page, 'Alpha')).toBeVisible()
    await page.getByLabel('Home').check()
    await expect(event(page, 'Beta')).toBeVisible()
  })

  test('quick add reads what was typed', async ({ page }) => {
    await page.goto(extras)
    await page.getByLabel('Add an event').fill('Lunch friday 12:30 for 1h')
    await page.keyboard.press('Enter')
    await expect(page.locator('.added')).toHaveText('Lunch|2026-06-19T12:30:00|60')
  })

  test('drafts apply or discard, and the toast undoes', async ({ page }) => {
    await page.goto(extras)
    await page.locator('.draft-move').click()
    const bar = page.locator('[data-orb-part="draftBar"]')
    await expect(bar).toContainText('1 change')
    await expect(event(page, 'Alpha')).toHaveClass(/orb-event--tentative/)
    await expect(event(page, 'Alpha')).toContainText('13:00')
    await bar.getByRole('button', { name: 'Discard' }).click()
    await expect(event(page, 'Alpha')).toContainText('09:00')
    await page.locator('.draft-move').click()
    await bar.getByRole('button', { name: 'Apply' }).click()
    await expect(bar).toHaveCount(0)
    await expect(event(page, 'Alpha')).toContainText('13:00')
  })

  test('asks which occurrences to change', async ({ page }) => {
    await page.goto(extras)
    const repeat = event(page, 'Repeat').first()
    await page.setViewportSize({ width: 1280, height: 1600 })
    const from = await center(repeat)
    const box = (await repeat.boundingBox())!
    await drag(page, repeat, { x: from.x, y: from.y + box.height })
    const dialog = page.locator('.scope')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'All events' }).click()
    await expect(dialog).toHaveCount(0)
    expect(await logged(page)).toContain('scope all')
    const toast = page.locator('[data-orb-part="undoToast"]')
    await expect(toast).toContainText('Move event')
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(event(page, 'Repeat').first()).toContainText('11:00')
  })

  test('the command palette goes to dates, views and events', async ({ page }) => {
    await page.goto(extras)
    await page.locator('.palette').fill('2026-07-08')
    await page.locator('.palette-results button').first().click()
    await expect(page.locator('[data-orb-part="title"]')).toContainText('Jul')
    await page.locator('.palette').fill('alpha')
    await page.locator('.palette-results button').first().click()
    await expect(event(page, 'Alpha')).toBeVisible()
  })
})

test('the parts page exports the code being tried', async ({ page }) => {
  await page.goto('/#/parts')
  await expect(page.locator('.pp-export')).toContainText('<Scheduler')
})
