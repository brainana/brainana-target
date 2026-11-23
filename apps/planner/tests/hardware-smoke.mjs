import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { NVImage } from '@niivue/niivue'
import fs from 'node:fs/promises'
import { unpackProject } from '../src/data/archive.ts'
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLANNER_HEADLESS_SHELL ? {} : { channel: 'chrome' }),
  args: [
    ...(process.env.PLANNER_SINGLE_PROCESS ? ['--single-process', '--in-process-gpu'] : []),
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
})
try {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1150 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://127.0.0.1:5183')
  await page.locator('.startup').waitFor({ state: 'hidden' })
  const anatomy = NVImage.createNiftiArray(
    [32, 32, 32],
    [1, 1, 1],
    undefined,
    2,
    new Uint8Array(32 ** 3).fill(50),
  )
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Load reference MRI…', exact: true }).first().click()
  await (
    await chooser
  ).setFiles({ name: 'phantom.nii', mimeType: 'application/octet-stream', buffer: Buffer.from(anatomy) })
  await page.locator('button[data-feature="electrodes"]').click()
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('np2-four')
  await page.getByText('5120', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Usable electrode length (mm)', { exact: true }).inputValue(), '10')
  await page.getByText('Customize array and site geometry', { exact: true }).click()
  await page.getByLabel('Targeting shaft', { exact: true }).selectOption('3')
  // Preserve geometric placement when switching the reference tip.
  await page.getByRole('button', { name: 'Save project', exact: true }).click({ trial: true })
  await page.getByLabel('Selected shaft usable length (mm)', { exact: true }).fill('8')
  await page.getByLabel('Selected shaft usable length (mm)', { exact: true }).press('Tab')
  await page
    .getByRole('dialog')
    .getByText(/contacts exceed physical shaft/)
    .waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Selected shaft usable length (mm)', { exact: true }).fill('9.9')
  await page.getByLabel('Selected shaft usable length (mm)', { exact: true }).press('Tab')
  const exportProject = async () => {
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save project', exact: true }).click({ timeout: 5000 })
    return (await unpackProject(new Uint8Array(await fs.readFile(await (await downloaded).path())))).project
  }
  let saved = await exportProject()
  assert.equal(saved.electrodes[0].hardware.selectedShank, 3)
  assert.deepEqual(saved.electrodes[0].hardware.shankLengths, [10, 10, 10, 9.9])
  assert.equal(saved.electrodes[0].hardware.modified, true)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  saved = await exportProject()
  assert.deepEqual(saved.electrodes[0].hardware.shankLengths, [])
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  saved = await exportProject()
  assert.deepEqual(saved.electrodes[0].hardware.shankLengths, [10, 10, 10, 9.9])
  await page.getByLabel('Shaft reserved above grid (mm)', { exact: true }).fill('1')
  await page.getByLabel('Shaft reserved above grid (mm)', { exact: true }).press('Tab')
  saved = await exportProject()
  assert.equal(saved.electrodes[0].hardware.reservedLength, 1)
  assert.equal(saved.electrodes[0].length, 9)
  assert.deepEqual(saved.electrodes[0].hardware.shankLengths, [9, 9, 9, 8.9])
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('custom-array')
  const diagram = page.getByRole('img', { name: 'Electrode geometry: side, footprint and recording sites' })
  const bounds = await diagram.boundingBox()
  await diagram.click({ position: { x: bounds.width * 0.8, y: bounds.height * 0.3 } })
  saved = await exportProject()
  assert.ok(saved.electrodes[0].hardware.selectedShank > 0)
  await page.getByRole('button', { name: 'Inspect device geometry', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.screenshot({
    path: '/tmp/hardware-array.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Close device view', exact: true }).click()
  for (const preset of ['np-hd', 'np-nhp-long', 'plexon-u', 'micro-fma', 'utah']) {
    await page.getByLabel('Hardware preset', { exact: true }).selectOption(preset)
    saved = await exportProject()
    assert.equal(saved.electrodes[0].hardware.presetId, preset)
    assert.equal(await page.getByRole('dialog').count(), 0)
  }
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('np-nhp-long')
  await page.screenshot({
    path: '/tmp/hardware-linear.png',
    fullPage: true,
  })
  await page.locator('button[data-feature="targets"]').click()
  await page.getByRole('button', { name: 'Add target at crosshair', exact: true }).click()
  await page.getByRole('button', { name: 'Guided tutorial', exact: true }).first().click()
  const guide = page.getByRole('region', { name: 'Guided planning' })
  for (let i = 0; i < 6; i++) await guide.getByRole('button', { name: 'Next step', exact: true }).click()
  await guide.getByRole('heading', { name: 'Select the electrode', exact: true }).waitFor()
  assert.equal(
    await page
      .getByLabel('Electrode', { exact: true })
      .evaluate((el) => el.classList.contains('guided-target')),
    true,
  )
  await guide.getByRole('button', { name: 'Next step', exact: true }).click()
  await guide.getByRole('heading', { name: 'Choose electrode hardware', exact: true }).waitFor()
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('utah')
  assert.equal(await page.getByLabel('Usable electrode length (mm)', { exact: true }).inputValue(), '1.5')
  await guide.getByRole('button', { name: 'Next step', exact: true }).click()
  await guide.getByRole('heading', { name: 'Configure the manufactured device', exact: true }).waitFor()
  await guide.getByRole('button', { name: 'Next step', exact: true }).click()
  await guide.getByRole('heading', { name: 'Inspect the device layout', exact: true }).waitFor()
  await guide.getByRole('button', { name: 'Next step', exact: true }).click()
  await guide.getByRole('heading', { name: 'Define electrode reach', exact: true }).waitFor()
  assert.equal(
    await page
      .getByLabel('Usable electrode length (mm)', { exact: true })
      .evaluate((el) => el.classList.contains('guided-target')),
    true,
  )
  await guide.getByRole('button', { name: 'Next step', exact: true }).click()
  await guide.getByRole('heading', { name: 'Review insertion and recording sites', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log(
    '  ok - library, dense silicon probes, array footprint selection, individual length edits, undo/redo and exported hardware',
  )
} finally {
  await browser.close()
}
