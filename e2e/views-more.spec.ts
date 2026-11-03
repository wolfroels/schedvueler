import { center, dateCell, drag, event, expect, logged, open, test } from './helpers'

test.describe('more views', () => {
  test('N weeks', async ({ page }) => {
    await open(page, { view: 'two-weeks' })
    await expect(page.locator('[data-orb-part="monthWeek"]')).toHaveCount(2)
    await expect(event(page, 'Alpha')).toBeVisible()
  })

  test('several months', async ({ page }) => {
    await open(page, { view: 'multi-month' })
    await expect(page.locator('[data-orb-part="monthGrid"]')).toHaveCount(3)
    await expect(page.locator('[data-orb-part="multiMonthTitle"]').first()).toContainText('June')
    await page.locator('[data-orb-part="nextButton"]').click()
    await expect(page.locator('[data-orb-part="multiMonthTitle"]').first()).toContainText(
      'September',
    )
  })

  test('year planner shows bars and moves them', async ({ page }) => {
    await open(page, { view: 'planner' })
    await expect(page.locator('[data-orb-part="yearPlannerRow"]')).toHaveCount(12)
    await drag(page, event(page, 'Alpha'), dateCell(page, '2026-06-20'))
    expect((await logged(page)).join()).toContain('event-drop Alpha 2026-06-20T09:00:00')
  })

  test('week numbers in every view', async ({ page }) => {
    await open(page, {}, { weekNumbers: true })
    await expect(page.locator('[data-orb-part="weekNumber"]').first()).toHaveText('25')
    await open(page, { view: 'month' }, { weekNumbers: true })
    await expect(page.locator('[data-orb-part="weekNumber"]')).toHaveCount(5)
    await open(page, { view: 'year' }, { weekNumbers: true })
    await expect(page.locator('[data-orb-part="weekNumber"]').first()).toBeVisible()
  })

  test('more time zones next to the times', async ({ page }) => {
    await open(page, {}, { extraTimeZones: ['America/New_York'] })
    const labels = page.locator('[data-orb-part="zoneLabel"]')
    await expect(labels.first()).toBeVisible()
    // 09:00 in Brussels is 03:00 in New York in June.
    await expect(labels.nth(9)).toHaveText(/3|03/)
  })

  test('both times show in a week with a clock change in that zone', async ({ page }) => {
    // New York moves on 8 March 2026, Brussels only on the 29th: 09:00 is 03:00, then 04:00.
    await open(page, { date: '2026-03-04' }, { extraTimeZones: ['America/New_York'] })
    await expect(page.locator('[data-orb-part="zoneLabel"]').nth(9)).toHaveText(/3.*\/.*4/)
  })
})

test.describe('toolbar', () => {
  test('puts views past the limit in a menu', async ({ page }) => {
    await open(page, {}, { maxViewButtons: 2 })
    await expect(page.locator('[data-orb-part="viewButton"]')).toHaveCount(2)
    await page.locator('[data-orb-part="viewMenu"]').selectOption('month')
    await expect(page.locator('[data-orb-part="monthGrid"]')).toBeVisible()
  })

  test('the title has a date picker', async ({ page }) => {
    await open(page, {}, { titleDatePicker: true })
    await expect(page.locator('[data-orb-part="titlePicker"]')).toBeVisible()
    await page.locator('.orb-toolbar__picker').evaluate((el: HTMLInputElement) => {
      el.value = '2026-07-08'
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.locator('[data-orb-part="title"]')).toContainText('Jul')
  })

  test('shows loading and error', async ({ page }) => {
    await open(page, {}, { loading: true })
    await expect(page.locator('[data-orb-part="loading"]')).toHaveText('Loading…')
    await open(page, {}, { error: 'No connection' })
    await expect(page.locator('[data-orb-part="error"]')).toHaveText('No connection')
  })

  test('work weeks and responsive views', async ({ page }) => {
    await open(page, { view: 'work' })
    await expect(page.locator('[data-orb-part="dayHeader"]')).toHaveCount(5)
    await open(page, {}, { responsiveViews: [{ maxWidth: 5000, views: ['day', 'month'] }] })
    await expect(page.locator('[data-orb-part="viewButton"]')).toHaveCount(2)
  })
})

test.describe('timeline', () => {
  const MONTH = { period: 'month' }

  test('uses visible borders for row and slot separators', async ({ page }) => {
    await open(page, { view: 'timeline' })
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      const border = await page
        .locator('.orb-tl__corner')
        .evaluate((element) => getComputedStyle(element).borderInlineEndColor)
      await expect(page.locator('.orb-tl__row').first()).toHaveCSS('border-bottom-color', border)
      await expect(page.locator('.orb-tl__slots-row')).toHaveCSS('border-top-color', border)
      await expect(page.locator('.orb-tl__slot-heading.is-labelled').first()).toHaveCSS(
        'border-inline-start-color',
        border,
      )
      const grid = await page
        .locator('.orb-tl__day-column')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundImage)
      expect(grid).toContain(`${border} 1px`)
    }
  })

  test('renders only what is in view on a long axis', async ({ page }) => {
    await open(page, {
      view: 'timeline',
      tl: JSON.stringify({ ...MONTH, slotDuration: 60, slotWidth: 40 }),
    })
    const headings = page.locator('[data-orb-part="timelineSlotHeading"]')
    await expect(headings.first()).toBeVisible()
    // 30 days of 14 hours is 420 columns.
    expect(await headings.count()).toBeLessThan(200)
    const scroller = page.locator('.orb-tl__scroller')
    await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth))
    await expect(page.getByText('19:00').first()).toBeVisible()
  })

  test('multi-tier headers', async ({ page }) => {
    await open(page, {
      view: 'timeline',
      tl: JSON.stringify({ ...MONTH, headerTiers: ['month', 'week'] }),
    })
    const tiers = page.locator('[data-orb-part="timelineTier"]')
    await expect(tiers.first()).toContainText('June 2026')
    expect(await tiers.count()).toBeGreaterThan(4)
  })

  test('counts timed events per day', async ({ page }) => {
    await open(page, { view: 'timeline', tl: JSON.stringify({ ...MONTH, dayEvents: 'count' }) })
    await expect(page.locator('[data-orb-part="dayCount"]').first()).toHaveText('1')
    await page.locator('.orb-tl__scroller').evaluate((el) => (el.scrollLeft = 1400))
    await expect(event(page, 'Alpha')).toHaveCount(0)
    await expect(event(page, 'Holiday')).toHaveCount(1)
  })

  test('searches resources', async ({ page }) => {
    await open(page, { view: 'timeline', tl: JSON.stringify({ resourceSearch: true }) })
    await expect(page.locator('[data-orb-part="timelineRow"]')).toHaveCount(2)
    await page.locator('[data-orb-part="resourceSearch"]').fill('two')
    await expect(page.locator('[data-orb-part="timelineRow"]')).toHaveCount(1)
    await expect(page.locator('[data-orb-part="resourceLabel"]')).toContainText('Room two')
  })

  test('resource area resizes from its full-height divider by default', async ({ page }) => {
    await open(page, { view: 'timeline' })
    const splitter = page.getByRole('separator', { name: 'Resources' })
    const timeline = page.locator('.orb-tl')
    const corner = page.locator('[data-orb-part="timelineCorner"]')
    const before = (await corner.boundingBox())!.width
    expect((await splitter.boundingBox())!.height).toBeGreaterThan(
      (await timeline.boundingBox())!.height - 4,
    )
    const start = await center(splitter)
    await drag(page, splitter, { x: start.x + 60, y: start.y })
    await expect(corner).toHaveCSS('width', `${before + 60}px`)
    await expect(page.locator('.orb-tl__label').first()).toHaveCSS('width', `${before + 60}px`)
    await splitter.focus()
    await page.keyboard.press('ArrowRight')
    await expect(corner).toHaveCSS('width', `${before + 70}px`)
    await page.keyboard.press('Home')
    await expect(corner).toHaveCSS('width', '80px')
  })

  test('resource area resizing can be disabled', async ({ page }) => {
    await open(page, { view: 'timeline', tl: JSON.stringify({ resourceAreaResizable: false }) })
    await expect(page.locator('[data-orb-part="resourceResizer"]')).toHaveCount(0)
  })

  test('resource area resizing supports RTL and width limits', async ({ page }) => {
    await open(page, { view: 'timeline', rtl: '1' })
    const splitter = page.locator('[data-orb-part="resourceResizer"]')
    const corner = page.locator('[data-orb-part="timelineCorner"]')
    const before = (await corner.boundingBox())!.width
    const start = await center(splitter)
    await drag(page, splitter, { x: start.x - 60, y: start.y })
    await expect(corner).toHaveCSS('width', `${before + 60}px`)
    await splitter.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(corner).toHaveCSS('width', `${before + 70}px`)
    await page.keyboard.press('End')
    const maximum = await page.locator('.orb-tl').evaluate((element) => element.clientWidth - 80)
    await expect(corner).toHaveCSS('width', `${maximum}px`)
    await page.keyboard.press('ArrowLeft')
    await expect(corner).toHaveCSS('width', `${maximum}px`)
  })

  test('more resource columns, and resizing the area', async ({ page }) => {
    const resources = [{ id: 'r1', title: 'Room one', seats: 12 }]
    await open(
      page,
      {
        view: 'timeline',
        tl: JSON.stringify({
          resourceAreaResizable: true,
          resourceColumns: [{ key: 'seats', label: 'Seats', width: '3rem' }],
        }),
      },
      { resources },
    )
    await expect(page.locator('[data-orb-part="resourceCell"]')).toHaveText('12')
    const corner = page.locator('[data-orb-part="timelineCorner"]')
    const before = (await corner.boundingBox())!.width
    await drag(page, page.locator('[data-orb-part="resourceResizer"]'), {
      x: (await center(page.locator('[data-orb-part="resourceResizer"]'))).x + 60,
      y: 60,
    })
    expect((await corner.boundingBox())!.width).toBeGreaterThan(before + 40)
  })

  test('reorders rows by dragging', async ({ page }) => {
    await open(page, { view: 'timeline', tl: JSON.stringify({ resourceReorder: true }) })
    const labels = page.locator('[data-orb-part="resourceLabel"]')
    const second = await labels.nth(1).boundingBox()
    await drag(page, labels.nth(0), { x: second!.x + 10, y: second!.y + second!.height - 4 })
    expect(await logged(page)).toContain('resource-reorder r1 r2 after')
  })

  test('shows load per day', async ({ page }) => {
    await open(page, { view: 'timeline', tl: JSON.stringify({ ...MONTH, load: { capacity: 60 } }) })
    await expect(page.locator('.orb-tl__load--level-3').first()).toContainText('100%')
  })

  test('expands lazy resources', async ({ page }) => {
    const resources = [{ id: 'r1', title: 'Group', lazy: true }]
    await open(page, { view: 'timeline' }, { resources })
    await page.locator('[data-orb-part="resourceToggle"]').click()
    expect(await logged(page)).toContain('resource-expand r1')
  })

  test('moves an event on several resources together', async ({ page }) => {
    const resources = [1, 2, 3, 4].map((n) => ({ id: `s${n}`, title: `Seat ${n}` }))
    await open(page, { view: 'timeline' }, { resources, multiResourceDrag: 'all' }, [
      {
        id: 'pair',
        title: 'Pair',
        start: '2026-06-15T09:00:00',
        end: '2026-06-15T10:00:00',
        resourceIds: ['s1', 's2'],
      },
    ])
    const lanes = page.locator('[data-orb-part="timelineLane"]')
    const from = await center(event(page, 'Pair').first())
    const to = await center(lanes.nth(1))
    await drag(page, event(page, 'Pair').first(), { x: from.x, y: to.y })
    expect((await logged(page)).join()).toContain('@s2,s3')
  })

  test('zooms with Ctrl + scroll', async ({ page }) => {
    const zoomLevels = [
      { slotDuration: 60, slotWidth: 40 },
      { slotDuration: 30, slotWidth: 80 },
    ]
    await open(page, { view: 'timeline', tl: JSON.stringify({ zoomLevels }) })
    const head = page.locator('.orb-tl__time-head')
    const before = (await head.boundingBox())!.width
    const lane = await center(page.locator('[data-orb-part="timelineLane"]').first())
    await page.mouse.move(lane.x, lane.y)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    await expect.poll(async () => (await head.boundingBox())!.width).toBeGreaterThan(before * 1.5)
    expect((await logged(page)).join()).toContain('zoom-change 1')
  })
})

test('Gantt: one row per event, with progress, milestones and arrows', async ({ page }) => {
  await open(page, { view: 'gantt' }, {}, [
    { id: 't1', title: 'Design', start: '2026-06-02', end: '2026-06-05', progress: 0.5 },
    { id: 't2', title: 'Build', start: '2026-06-08', end: '2026-06-12', dependsOn: ['t1'] },
    { id: 'm', title: 'Launch', start: '2026-06-20T00:00:00', end: '2026-06-20T00:00:00' },
  ])
  await expect(page.locator('[data-orb-part="resourceLabel"]', { hasText: 'Design' })).toBeVisible()
  await expect(page.locator('[data-orb-part="eventProgress"]')).toHaveCount(1)
  await page.locator('.orb-tl__scroller').evaluate((el) => (el.scrollLeft = 500))
  await expect(page.locator('.orb-event--milestone')).toHaveCount(1)
  await page.locator('.orb-tl__scroller').evaluate((el) => (el.scrollLeft = 0))
  await expect(page.locator('[data-orb-part="dependency"]')).toHaveCount(1)
  const rows = await page.locator('[data-orb-part="timelineRow"]').count()
  expect(rows).toBeGreaterThanOrEqual(3)
  await drag(page, event(page, 'Build').first(), {
    x: (await center(event(page, 'Build').first())).x + 96,
    y: (await center(event(page, 'Build').first())).y,
  })
  expect((await logged(page)).join()).toContain('event-drop Build 2026-06-10')
})

test('a custom view works like the others', async ({ page }) => {
  await open(page, { view: 'cards' })
  await expect(page.locator('[data-orb-part="title"]')).toHaveText('Cards from 2026-06-15')
  await page.getByRole('button', { name: 'Alpha' }).click()
  expect(await logged(page)).toContain('event-click Alpha')
  await page.locator('[data-orb-part="nextButton"]').click()
  await expect(page.locator('[data-orb-part="title"]')).toHaveText('Cards from 2026-06-22')
})
