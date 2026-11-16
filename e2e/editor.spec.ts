import AxeBuilder from '@axe-core/playwright'
import { cell, drag, event, expect, logged, open, test } from './helpers'

// The fixture with ?editor: selecting creates and double-clicking edits, through
// <SchedulerEventEditor>, which writes the events back and logs the undo label.

const editorPage = (page: Parameters<typeof open>[0]) => open(page, { editor: '1' })
const dialog = (page: Parameters<typeof open>[0]) => page.getByRole('dialog')

test('selecting a range opens the editor and saves a new event', async ({ page }) => {
  await editorPage(page)
  await drag(page, cell(page, 0, 24), cell(page, 0, 27))
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByRole('heading')).toHaveText('New event')
  await expect(dialog(page).getByLabel('Starts, time')).toHaveValue('12:00')
  await expect(dialog(page).getByLabel('Ends, time')).toHaveValue('14:00')
  await dialog(page).getByLabel('Title').fill('Site walk')
  await dialog(page).getByLabel('Title').press('Enter')
  await expect(dialog(page)).toBeHidden()
  await expect(event(page, 'Site walk')).toBeVisible()
  expect(await logged(page)).toContain('editor New event: Site walk')
})

test('editing an event changes its time and keeps its id', async ({ page }) => {
  await editorPage(page)
  await event(page, 'Alpha').dblclick()
  await expect(dialog(page).getByRole('heading')).toHaveText('Edit event')
  await expect(dialog(page).getByLabel('Title')).toHaveValue('Alpha')
  await expect(dialog(page).getByLabel('Resource')).toHaveValue('r1')
  // Moving the start keeps the length: 09:00–10:00 becomes 11:00–12:00.
  await dialog(page).getByLabel('Starts, time').fill('11:00')
  await dialog(page).getByLabel('Starts, time').blur()
  await expect(dialog(page).getByLabel('Ends, time')).toHaveValue('12:00')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(event(page, 'Alpha')).toContainText('11:00')
  expect(await logged(page)).toContain('editor Edit event: Alpha')
})

test('renaming one occurrence of a series asks which ones', async ({ page }) => {
  await editorPage(page)
  await event(page, 'Standup').nth(1).dblclick()
  await dialog(page).getByLabel('Title').fill('Demo')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(dialog(page).getByText('Save the change for')).toBeVisible()
  await dialog(page)
    .getByRole('button', { name: /This event/ })
    .click()
  await expect(event(page, 'Demo')).toHaveCount(1)
  await expect(event(page, 'Standup')).toHaveCount(2)
})

test('a changed rule offers only the series-wide choices', async ({ page }) => {
  await editorPage(page)
  await event(page, 'Standup').first().dblclick()
  await expect(dialog(page).getByLabel('Repeat')).toHaveValue('DAILY')
  await dialog(page).getByLabel('Repeat').selectOption('WEEKLY')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(dialog(page).getByRole('button', { name: /This event/ })).toHaveCount(0)
  await dialog(page)
    .getByRole('button', { name: /All events/ })
    .click()
  await expect(event(page, 'Standup')).toHaveCount(1)
})

test('deleting from the editor', async ({ page }) => {
  await editorPage(page)
  await event(page, 'Beta').dblclick()
  await dialog(page).getByRole('button', { name: 'Delete' }).click()
  await expect(event(page, 'Beta')).toHaveCount(0)
  expect(await logged(page)).toContain('editor Delete: Beta')
})

test('an end before the start cannot be saved', async ({ page }) => {
  await editorPage(page)
  await event(page, 'Alpha').dblclick()
  await dialog(page).getByLabel('Ends, time').fill('08:00')
  await expect(dialog(page).getByRole('alert')).toHaveText('The end is not after the start.')
  await expect(dialog(page).getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('Escape closes without saving and gives focus back', async ({ page }) => {
  await editorPage(page)
  await event(page, 'Alpha').dblclick()
  await dialog(page).getByLabel('Title').fill('Changed')
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(event(page, 'Alpha')).toBeVisible()
  expect((await logged(page)).some((l) => l.startsWith('editor'))).toBe(false)
  await expect(event(page, 'Alpha')).toBeFocused()
})

for (const theme of ['light', 'dark']) {
  test(`the open editor has no detectable problems, ${theme}`, async ({ page }) => {
    await open(page, { editor: '1' }, { theme })
    await event(page, 'Standup').first().dblclick()
    await expect(dialog(page)).toBeVisible()
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
    const results = await new AxeBuilder({ page })
      .include('.orb-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([])
  })
}
