import { expect, test as base, type Locator, type Page } from '@playwright/test'

/** Fails any test that logs an error or a Vue warning, or throws in the page. */
export const test = base.extend<{ pageProblems: void }>({
  pageProblems: [
    async ({ page }, use) => {
      const problems: string[] = []
      page.on('pageerror', (e) => problems.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error' || m.text().includes('[Vue warn]')) problems.push(m.text())
      })
      await use()
      expect(problems).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Opens the test page. The week starts on Monday 15 June 2026; slots are 30 minutes. */
export async function open(page: Page, query: Record<string, string> = {}) {
  await page.goto(`/e2e/fixture/?${new URLSearchParams(query)}`)
  await expect(page.locator('[data-orb-part="root"]')).toBeVisible()
}

export const event = (page: Page, title: string) =>
  page.locator('[data-orb-part="event"]:not(.orb-event--mirror)', { hasText: title })

/** A time grid cell: `col` counts visible days from 0, `slot` is half hours from midnight. */
export const cell = (page: Page, col: number, slot: number) =>
  page.locator(`[data-cell="${col}-${slot}"]`)

export const dateCell = (page: Page, date: string) => page.locator(`[data-date="${date}"]`)

export const logged = (page: Page) =>
  page.evaluate(() => (window as unknown as { orbLog: string[] }).orbLog)

export async function center(target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error(`Not visible: ${target}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export async function press(page: Page, from: Locator) {
  const { x, y } = await center(from)
  await page.mouse.move(x, y)
  await page.mouse.down()
}

/** Moves in steps, as a real pointer does; the scheduler only starts a drag after a few pixels. */
export async function moveTo(page: Page, to: Locator | { x: number; y: number }) {
  const { x, y } = 'x' in to ? to : await center(to)
  await page.mouse.move(x, y, { steps: 5 })
}

export async function drag(page: Page, from: Locator, to: Locator | { x: number; y: number }) {
  await press(page, from)
  await moveTo(page, to)
  await page.mouse.up()
}
