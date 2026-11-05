import { expect, test } from './helpers'

// Budgets against the dev build of the playground, on whatever machine runs them, so they are wide:
// they catch something becoming several times slower, not small changes. `PERF_REPORT=1` prints
// the numbers.
const BUDGET_MS: Record<string, number> = { Week: 600, Month: 900, 'Timeline month': 1500 }

test.skip(({ browserName }) => browserName !== 'chromium', 'One browser is enough')

for (const [view, budget] of Object.entries(BUDGET_MS)) {
  test(`${view}: navigating at 20 000 events stays within budget`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/')
    await page.locator('.pg__sidebar select').first().selectOption('20000')
    await page.locator('[data-orb-part="viewButton"]', { hasText: new RegExp(`^${view}$`) }).click()
    const next = page.locator('[data-orb-part="nextButton"]')
    const times: number[] = await page.evaluate(async () => {
      const next = document.querySelector<HTMLElement>('[data-orb-part="nextButton"]')!
      const prev = document.querySelector<HTMLElement>('[data-orb-part="prevButton"]')!
      const out: number[] = []
      // Back and forth, so that it stays where the events are.
      for (let i = 0; i < 8; i++) {
        const t = performance.now()
        ;(i % 2 ? prev : next).click()
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
        out.push(performance.now() - t)
      }
      return out
    })
    await expect(next).toBeVisible()
    const nodes = await page.evaluate(() => document.querySelectorAll('.schedvueler *').length)
    // The first step warms caches.
    const best = times.slice(1).sort((a, b) => a - b)[Math.floor((times.length - 1) / 2)]!
    if (process.env.PERF_REPORT)
      console.log(
        `${view}: median ${best.toFixed(0)} ms, ${nodes} nodes, all ${times.map((t) => t.toFixed(0))}`,
      )
    expect(best).toBeLessThan(budget)
  })
}
