import { center, drag, event, expect, logged, open, test } from './helpers'

// A timeline with a group row between two resources: Room one, then Group with Room two in it.
// Alpha is on r1.
const resources = [
  { id: 'r1', title: 'Room one' },
  { id: 'g', title: 'Group' },
  { id: 'r2', title: 'Room two', parentId: 'g' },
]
const lane = (page: Parameters<typeof open>[0], n: number) =>
  page.locator('[data-orb-part="timelineLane"]').nth(n)

test('an event cannot be dropped on a group row by default', async ({ page }) => {
  await open(page, { view: 'timeline' }, { resources })
  const from = await center(event(page, 'Alpha'))
  await drag(page, event(page, 'Alpha'), { x: from.x, y: (await center(lane(page, 1))).y })
  const log = (await logged(page)).join()
  expect(log).not.toContain('event-drop Alpha')
  expect(log).toContain('event-drag-cancel Alpha invalid')
})

test('drop-on-groups allows it', async ({ page }) => {
  await open(page, { view: 'timeline' }, { resources, dropOnGroups: true })
  const from = await center(event(page, 'Alpha'))
  await drag(page, event(page, 'Alpha'), { x: from.x, y: (await center(lane(page, 1))).y })
  expect((await logged(page)).join()).toMatch(/event-drop Alpha .* @g/)
})

test('a resource row next to a group still takes the event', async ({ page }) => {
  await open(page, { view: 'timeline' }, { resources })
  const from = await center(event(page, 'Alpha'))
  await drag(page, event(page, 'Alpha'), { x: from.x, y: (await center(lane(page, 2))).y })
  expect((await logged(page)).join()).toMatch(/event-drop Alpha .* @r2/)
})

test('Alt + down skips the group row', async ({ page }) => {
  await open(page, { view: 'timeline' }, { resources })
  await event(page, 'Alpha').focus()
  await page.keyboard.press('Alt+ArrowDown')
  const log = (await logged(page)).join()
  expect(log).toMatch(/event-drop Alpha .* @r2/)
  expect(log).not.toContain('event-change-failed')
})

test('nothing is created on a group row', async ({ page }) => {
  await open(page, { view: 'timeline' }, { resources })
  const row = await center(lane(page, 1))
  const box = (await lane(page, 1).boundingBox())!
  await page.mouse.move(box.x + 40, row.y)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, row.y, { steps: 5 })
  await page.mouse.up()
  expect((await logged(page)).some((l) => l.startsWith('select'))).toBe(false)
})
