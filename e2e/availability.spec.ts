import { cell, dateCell, drag, event, expect, logged, moveTo, open, press, test } from './helpers'

const OFFICE = { start: '09:00', end: '17:00' }

test.describe('business hours', () => {
  test('shades closed hours in the time grid, the month and the timeline', async ({ page }) => {
    await open(page, {}, { businessHours: OFFICE })
    // Weekdays are closed before and after; the weekend all day.
    await expect(page.locator('[data-orb-part="closedTime"]')).toHaveCount(5 * 2 + 2)
    await open(page, { view: 'month' }, { businessHours: OFFICE })
    await expect(dateCell(page, '2026-06-20')).toHaveClass(/is-closed/)
    await expect(dateCell(page, '2026-06-19')).not.toHaveClass(/is-closed/)
    await open(page, { view: 'timeline' }, { businessHours: OFFICE })
    await expect(page.locator('[data-orb-part="closedTime"]').first()).toBeVisible()
  })

  test('a resource has its own hours', async ({ page }) => {
    const resources = [
      { id: 'r1', title: 'Late', businessHours: { start: '12:00', end: '20:00' } },
      { id: 'r2', title: 'Default' },
    ]
    await open(page, { view: 'rooms' }, { businessHours: OFFICE, resources })
    const heights = await page
      .locator('[data-orb-part="column"]')
      .evaluateAll((cols) =>
        cols.map(
          (c) => (c.querySelector('[data-orb-part="closedTime"]') as HTMLElement).style.height,
        ),
      )
    expect(parseFloat(heights[0]!)).toBeCloseTo(50, 3)
    expect(parseFloat(heights[1]!)).toBeCloseTo(37.5, 3)
  })

  test('businessHoursOnly refuses a drop outside them', async ({ page }) => {
    await open(page, {}, { businessHours: OFFICE, businessHoursOnly: true })
    await drag(page, cell(page, 0, 18), cell(page, 0, 14))
    const log = await logged(page)
    expect(log).toContain('event-change-failed Alpha business-hours')
    expect(log.join()).not.toContain('event-drop')
    await drag(page, cell(page, 0, 18), cell(page, 0, 20))
    expect((await logged(page)).join()).toContain('event-drop Alpha 2026-06-15T10:00:00')
  })
})

test.describe('blocked times', () => {
  const blockedTimes = [
    { start: '2026-06-16T10:00:00', end: '2026-06-16T12:00:00', title: 'Maintenance' },
  ]

  test('are drawn and refuse drops and selections', async ({ page }) => {
    await open(page, {}, { blockedTimes })
    await expect(page.locator('[data-orb-part="blockedTime"]')).toContainText('Maintenance')
    await press(page, cell(page, 0, 18))
    await moveTo(page, cell(page, 1, 20))
    await expect(page.locator('.orb-event--invalid')).toBeVisible()
    await page.mouse.up()
    expect(await logged(page)).toContain('event-change-failed Alpha blocked')

    await drag(page, cell(page, 1, 18), cell(page, 1, 21))
    expect((await logged(page)).join()).not.toContain('select ')
  })

  test('only block their own resource', async ({ page }) => {
    await open(
      page,
      { view: 'rooms' },
      {
        blockedTimes: [
          {
            ...blockedTimes[0],
            start: '2026-06-15T10:00:00',
            end: '2026-06-15T12:00:00',
            resourceId: 'r2',
          },
        ],
      },
    )
    await drag(page, cell(page, 0, 18), cell(page, 1, 20))
    expect(await logged(page)).toContain('event-change-failed Alpha blocked')
    await drag(page, cell(page, 0, 18), cell(page, 0, 20))
    expect((await logged(page)).join()).toContain('event-drop Alpha 2026-06-15T10:00:00')
  })
})

test.describe('date limits', () => {
  const opts = { minDate: '2026-06-10', maxDate: '2026-06-24' }

  test('stop navigation at the limits', async ({ page }) => {
    await open(page, {}, opts)
    const next = page.locator('[data-orb-part="nextButton"]')
    await expect(next).toBeEnabled()
    await next.click()
    await expect(next).toBeDisabled()
    const prev = page.locator('[data-orb-part="prevButton"]')
    await prev.click()
    await prev.click()
    await expect(prev).toBeDisabled()
  })

  test('refuse edits outside them', async ({ page }) => {
    await open(page, {}, { minDate: '2026-06-15', maxDate: '2026-06-16' })
    await drag(page, cell(page, 0, 18), cell(page, 2, 18))
    expect(await logged(page)).toContain('event-change-failed Alpha date-limit')
    await expect(cell(page, 2, 18).locator('..')).toHaveClass(/is-out-of-range/)
  })
})

test('background events are drawn, not treated as events', async ({ page }) => {
  await open(page, {}, {}, [
    { id: 'h', title: 'Closed', start: '2026-06-16', display: 'background', color: '#ff0000' },
  ])
  await expect(page.locator('[data-orb-part="backgroundEvent"]')).toContainText('Closed')
  await expect(event(page, 'Closed')).toHaveCount(0)
  await open(page, { view: 'month' }, {}, [
    { id: 'h', title: 'Closed', start: '2026-06-16', display: 'background' },
  ])
  await expect(page.locator('[data-orb-part="backgroundEvent"]')).toHaveCount(1)
})

test('per-event fields', async ({ page }) => {
  await open(page, {}, {}, [
    {
      id: 'fixed',
      title: 'Fixed',
      start: '2026-06-16T09:00:00',
      end: '2026-06-16T10:00:00',
      editable: false,
      class: 'my-event',
      textColor: 'rgb(1, 2, 3)',
    },
  ])
  const fixed = event(page, 'Fixed')
  await expect(fixed).toHaveClass(/my-event/)
  await expect(fixed).toHaveCSS('color', 'rgb(1, 2, 3)')
  await expect(fixed.locator('.orb-event__resizer--end')).toHaveCount(0)
  await drag(page, cell(page, 1, 18), cell(page, 1, 22))
  expect((await logged(page)).join()).not.toContain('event-drop Fixed')
})

test('eventOverlap forbid refuses an overlap, background events aside', async ({ page }) => {
  await open(page, {}, { eventOverlap: 'forbid' }, [
    { id: 'h', title: 'Bg', start: '2026-06-17', display: 'background' },
  ])
  await drag(page, cell(page, 0, 18), cell(page, 2, 18))
  expect(await logged(page)).toContain('event-change-failed Alpha overlap')
  await drag(page, cell(page, 0, 18), cell(page, 2, 22))
  expect((await logged(page)).join()).toContain('event-drop Alpha 2026-06-17T11:00:00')
})

test('durationLimits refuse a resize', async ({ page }) => {
  await open(page, {}, { durationLimits: { max: 90 } })
  await drag(page, event(page, 'Alpha').locator('.orb-event__resizer--end'), cell(page, 0, 24))
  expect(await logged(page)).toContain('event-change-failed Alpha duration')
})

test('marks events outside the visible hours', async ({ page }) => {
  await open(page, {}, { dayStartTime: '10:00', dayEndTime: '12:00' })
  const hidden = page.locator('[data-orb-part="hiddenIndicator"]')
  await expect(hidden.first()).toContainText('1')
})

test('days can run past midnight', async ({ page }) => {
  await open(page, {}, { dayStartTime: '18:00', dayEndTime: '30:00' }, [
    { id: 'n', title: 'Night', start: '2026-06-17T01:00:00', end: '2026-06-17T03:00:00' },
  ])
  // 01:00 on Wednesday belongs to Tuesday's column, the second, at the fourteenth half hour.
  const night = event(page, 'Night')
  await expect(night).toBeVisible()
  const column = night.locator('xpath=ancestor::*[@data-orb-part="column"]')
  await expect(column.locator('[data-cell="1-0"]')).toHaveCount(1)
  // Away from the scroller's bottom edge, where dragging would scroll the grid along.
  await cell(page, 1, 15).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await drag(page, cell(page, 1, 14), cell(page, 1, 16))
  expect((await logged(page)).join()).toContain('event-drop Night 2026-06-17T02:00:00')
})

test('the exposed API scrolls and reads events', async ({ page }) => {
  await open(page)
  const scrollTop = () => page.locator('.orb-tg__scroller').evaluate((el) => el.scrollTop)
  const before = await scrollTop()
  await page.evaluate(() =>
    (
      window as unknown as { orbScheduler: { value: { scrollToTime(t: string): void } } }
    ).orbScheduler.value.scrollToTime('12:00'),
  )
  expect(await scrollTop()).toBeGreaterThan(before)

  const count = await page.evaluate(
    () =>
      (
        window as unknown as { orbScheduler: { value: { getEvents(): unknown[] } } }
      ).orbScheduler.value.getEvents().length,
  )
  expect(count).toBeGreaterThanOrEqual(5)

  const ok = await page.evaluate(() =>
    (
      window as unknown as {
        orbScheduler: { value: { scrollToEvent(id: string): Promise<boolean> } }
      }
    ).orbScheduler.value.scrollToEvent('busy-0'),
  )
  expect(ok).toBe(true)
  await expect(event(page, 'Busy 0')).toBeVisible()
})
