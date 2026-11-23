import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({
  headless: true,
  args: [
    '--single-process',
    '--in-process-gpu',
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
    '--enable-unsafe-swiftshader',
  ],
})
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://127.0.0.1:5183')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'BrainanaTarget settings' })
  await dialog.getByLabel('Theme', { exact: true }).selectOption('light')
  await dialog.getByLabel('Larger buttons and input controls').check()
  await dialog.getByRole('button', { name: 'Saving', exact: true }).click()
  await dialog.getByLabel('Autosave projects locally').uncheck()
  await dialog.getByRole('button', { name: 'Display', exact: true }).click()
  await dialog.getByLabel('Crosshair width (0 hides crosshairs)').fill('3')
  await dialog.getByLabel('Crosshair width (0 hides crosshairs)').press('Tab')
  const event = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export settings' }).click()
  const exported = await event
  assert.equal(exported.suggestedFilename(), 'BrainanaTarget-settings.json')
  await dialog.getByRole('button', { name: 'Close settings' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click()
  await dialog.getByLabel('Theme', { exact: true }).waitFor()
  assert.equal(await dialog.getByLabel('Theme', { exact: true }).inputValue(), 'light')
  await dialog.getByRole('button', { name: 'Saving', exact: true }).click()
  assert.equal(await dialog.getByLabel('Autosave projects locally').isChecked(), false)
  await dialog.getByRole('button', { name: 'Display', exact: true }).click()
  assert.equal(await dialog.getByLabel('Crosshair width (0 hides crosshairs)').inputValue(), '3')
  await dialog.getByRole('button', { name: 'Restore default settings' }).click()
  await dialog.getByRole('button', { name: 'Appearance', exact: true }).click()
  assert.equal(await dialog.getByLabel('Theme', { exact: true }).inputValue(), 'amber')
  await dialog.getByRole('button', { name: 'Saving', exact: true }).click()
  assert.equal(await dialog.getByLabel('Autosave projects locally').isChecked(), true)
  assert.deepEqual(errors, [])
  console.log(
    'Settings: live changes, export, reload persistence, autosave preference, defaults and dialog passed.',
  )
} finally {
  await browser.close()
}
