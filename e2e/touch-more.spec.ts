import type { CDPSession, Page } from '@playwright/test'
import { center, dateCell, event, expect, logged, open, test } from './helpers'

// Real touch input needs Chrome's debugging protocol, which Firefox and WebKit don't have here.
test.skip(({ browserName }) => browserName !== 'chromium', 'Needs the Chrome DevTools Protocol')
test.use({ hasTouch: true })

const touch = (cdp: CDPSession, type: string, points: { x: number; y: number }[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points } as never)

async function longPressDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const cdp = await page.context().newCDPSession(page)
  await touch(cdp, 'touchStart', [from])
  await expect.poll(() => logged(page)).toContain('event-drag-start Alpha move')
  await touch(cdp, 'touchMove', [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }])
  await touch(cdp, 'touchMove', [to])
  await touch(cdp, 'touchEnd', [])
}

test('drags in the month view', async ({ page }) => {
  await open(page, { view: 'month' })
  await longPressDrag(
    page,
    await center(event(page, 'Alpha')),
    await center(dateCell(page, '2026-06-24')),
  )
  await expect
    .poll(async () => (await logged(page)).join())
    .toContain('event-drop Alpha 2026-06-24T09:00:00')
})

test('drags between timeline rows', async ({ page }) => {
  await open(page, { view: 'timeline' })
  const from = await center(event(page, 'Alpha'))
  const row = await center(page.locator('[data-orb-part="timelineLane"]').nth(1))
  await longPressDrag(page, from, { x: from.x, y: row.y })
  await expect.poll(async () => (await logged(page)).join()).toMatch(/event-drop Alpha .*@r2/)
})

test('selects by long press', async ({ page }) => {
  await open(page, { view: 'month' })
  const cdp = await page.context().newCDPSession(page)
  const a = await center(dateCell(page, '2026-06-08'))
  const b = await center(dateCell(page, '2026-06-09'))
  await touch(cdp, 'touchStart', [a])
  await page.waitForTimeout(500)
  await touch(cdp, 'touchMove', [b])
  await touch(cdp, 'touchEnd', [])
  await expect.poll(async () => (await logged(page)).join()).toContain('select 2026-06-08')
})

test('swiping goes to the next and previous period', async ({ page }) => {
  await open(page, { view: 'month' })
  const cdp = await page.context().newCDPSession(page)
  const title = page.locator('[data-orb-part="title"]')
  await expect(title).toContainText('June')
  const swipe = async (dx: number) => {
    const start = { x: 640, y: 500 }
    await touch(cdp, 'touchStart', [start])
    for (const f of [0.25, 0.5, 0.75, 1]) {
      await touch(cdp, 'touchMove', [{ x: start.x + dx * f, y: start.y }])
    }
    await touch(cdp, 'touchEnd', [])
  }
  await swipe(-200)
  await expect(title).toContainText('July')
  await swipe(200)
  await expect(title).toContainText('June')
})

test('swiping works in the time grid too', async ({ page }) => {
  await open(page)
  const cdp = await page.context().newCDPSession(page)
  const start = { x: 640, y: 500 }
  await touch(cdp, 'touchStart', [start])
  for (const f of [0.25, 0.5, 0.75, 1]) {
    await touch(cdp, 'touchMove', [{ x: start.x - 200 * f, y: start.y }])
  }
  await touch(cdp, 'touchEnd', [])
  await expect(page.locator('[data-orb-part="title"]')).toContainText('22')
})

test('a quick tap on an event is a click, not a drag', async ({ page }) => {
  await open(page)
  await event(page, 'Alpha').tap()
  const log = await logged(page)
  expect(log).toContain('event-click Alpha')
  expect(log.join()).not.toContain('event-drag-start')
})
