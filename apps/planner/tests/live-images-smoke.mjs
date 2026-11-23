import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { NVImage } from '@niivue/niivue'
import { unpackProject } from '../src/data/archive.ts'
const bytes = (kind) =>
  NVImage.createNiftiArray(
    [12, 12, 12],
    [2, 2, 2],
    [2, 0, 0, -12, 0, 2, 0, -12, 0, 0, 2, 0, 0, 0, 0, 1],
    16,
    new Uint8Array(
      Float32Array.from({ length: 1728 }, (_, i) =>
        kind === 'atlas' ? (i % 12 < 5 ? 1 : 0) : kind === 'ct' ? (i % 12 < 3 ? 1000 : 50) : (i % 12) * 10,
      ).buffer,
    ),
  )
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
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://127.0.0.1:5183')
  const initial = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Load reference MRI…', exact: true }).first().click()
  await (
    await initial
  ).setFiles({ name: 'mri.nii', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes('mri')) })
  await page.locator('.welcome').waitFor({ state: 'hidden', timeout: 30000 })
  await page.locator('button[data-feature="targets"]').click()
  await page.getByRole('button', { name: 'Add target at crosshair' }).click()
  await page.locator('button[data-feature="images"]').click()
  const add = async (label, name, kind) => {
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: label, exact: true }).click()
    await (
      await chooser
    ).setFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes(kind)) })
    await page.getByRole('dialog', { name: `Adjust ${name}` }).waitFor()
  }
  await add('Add aligned CT…', 'ct.nii', 'ct')
  const ct = page.getByRole('dialog', { name: 'Adjust ct.nii' })
  assert.equal(await ct.getAttribute('aria-modal'), null)
  const before = await ct.boundingBox()
  await ct.getByRole('heading', { name: 'ct.nii' }).focus()
  await page.keyboard.press('ArrowLeft')
  const after = await ct.boundingBox()
  assert.ok(after.x < before.x)
  await ct.getByRole('button', { name: 'Close', exact: true }).click()
  const selector = page.getByLabel('Anatomical image', { exact: true })
  const choices = await selector
    .locator('option')
    .evaluateAll((nodes) => nodes.map((n) => ({ value: n.value, label: n.textContent })))
  assert.equal(choices.length, 2)
  const ctId = choices.find((c) => c.label.startsWith('CT')).value,
    mriId = choices.find((c) => c.label.startsWith('MRI')).value
  await selector.selectOption(ctId)
  await page.waitForTimeout(500)
  await page
    .getByRole('heading', { name: 'ct.nii', exact: true })
    .locator('..')
    .getByRole('button', { name: 'Adjust image…' })
    .click()
  await ct.getByText('Window center / width',{exact:true}).click()
  const live = ct.getByRole('slider', { name: 'Window center', exact: true })
  await live.fill('800.5')
  await live.dispatchEvent('input')
  await page.waitForTimeout(250)
  await ct
    .getByRole('status')
    .getByText('Display updated live. Changes are saved with the project.')
    .waitFor()
  await ct.getByRole('button', { name: 'Close', exact: true }).click()
  await add('Add aligned functional map…', 'func.nii', 'mri')
  await page
    .getByRole('dialog', { name: 'Adjust func.nii' })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  const atlas = async (name) => {
    await page.getByRole('button', { name: 'Add aligned atlas…', exact: true }).click()
    const d = page.getByRole('dialog', { name: 'Load an aligned atlas' })
    await d
      .getByLabel('Aligned atlas image')
      .setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes('atlas')) })
    await d.getByRole('button', { name: 'Load atlas', exact: true }).click()
    await d.waitFor({ state: 'hidden' })
    await page.waitForTimeout(300)
  }
  await atlas('atlas-a.nii')
  await atlas('atlas-b.nii')
  await page.getByRole('button', { name: 'Image layers', exact: true }).first().click()
  const layers = page.getByRole('dialog', { name: 'Image layers' })
  assert.equal(await layers.getByLabel('Show mri.nii').isChecked(), false)
  await layers.getByLabel('Show mri.nii').check()
  await layers.getByLabel('Show mri.nii').uncheck()
  await layers.getByLabel('Show func.nii').uncheck()
  await layers.getByLabel('Show atlas-a.nii').check()
  await layers.getByLabel('Show atlas-b.nii').uncheck()
  const save = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  const file = await (await save).path(),
    bundle = await unpackProject(new Uint8Array(await fs.readFile(file)))
  assert.equal(bundle.project.frame.referenceAssetId, mriId)
  assert.equal(bundle.project.display.anatomyAssetId, ctId)
  assert.equal(bundle.project.targets.length, 1)
  assert.equal(bundle.project.assets.filter((a) => a.role === 'atlas').length, 2)
  assert.equal(bundle.project.assets.find((a) => a.name === 'func.nii').imageDisplay.visible, false)
  assert.equal(bundle.project.display.atlasVisible, false)
  assert.equal(bundle.project.assets.find((a) => a.name === 'atlas-a.nii').imageDisplay.visible, true)
  const c = bundle.project.assets.find((a) => a.id === ctId).imageDisplay
  assert.ok(Math.abs((c.min + c.max) / 2 - 800) < 2)
  await selector.selectOption(mriId)
  await page.waitForTimeout(300)
  const reopen = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await (
    await reopen
  ).setFiles({
    name: 'layers.brainana-plan',
    mimeType: 'application/octet-stream',
    buffer: await fs.readFile(file),
  })
  await page.waitForTimeout(1000)
  assert.equal(await selector.inputValue(), ctId)
  assert.equal(await layers.getByLabel('Show func.nii').isChecked(), false)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: '/tmp/live-image-tools.png' })
  console.log(
    'MRI/CT underlay switch, movable nonmodal sliders, live saved contrast, independent functional/atlas visibility, multiple atlas retention and fixed reference frame passed.',
  )
} finally {
  await browser.close()
}
