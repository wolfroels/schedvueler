import type { CDPSession, Page } from '@playwright/test'
import { cell, center, event, expect, logged, open, test } from './helpers'

// Real touch input needs Chrome's debugging protocol, which Firefox and WebKit don't have here.
test.skip(({ browserName }) => browserName !== 'chromium', 'Needs the Chrome DevTools Protocol')
test.use({ hasTouch: true })

const touch = (cdp: CDPSession, type: string, points: { x: number; y: number }[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points } as never)

async function session(page: Page) {
  return page.context().newCDPSession(page)
}

test('long press then move drags an event', async ({ page }) => {
  await open(page)
  const cdp = await session(page)
  const from = await center(cell(page, 0, 18))
  const to = await center(cell(page, 1, 20))
  await touch(cdp, 'touchStart', [from])
  await expect.poll(() => logged(page)).toContain('event-drag-start Alpha move')
  await touch(cdp, 'touchMove', [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }])
  await touch(cdp, 'touchMove', [to])
  await touch(cdp, 'touchEnd', [])
  await expect
    .poll(() => logged(page))
    .toContain('event-drop Alpha 2026-06-16T10:00:00 2026-06-16T11:00:00 @r1')
})

test('moving right away scrolls instead of dragging', async ({ page }) => {
  await open(page)
  const cdp = await session(page)
  const from = await center(event(page, 'Alpha'))
  await touch(cdp, 'touchStart', [from])
  await touch(cdp, 'touchMove', [{ x: from.x, y: from.y - 60 }])
  await touch(cdp, 'touchMove', [{ x: from.x, y: from.y - 120 }])
  await touch(cdp, 'touchEnd', [])
  await page.waitForTimeout(600)
  expect((await logged(page)).join()).not.toContain('event-drag-start')
})
