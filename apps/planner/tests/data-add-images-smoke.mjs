import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { NVImage } from '@niivue/niivue'
import { unpackProject } from '../src/data/archive.ts'
const fixture = NVImage.createNiftiArray(
  [10, 10, 10],
  [2, 2, 2],
  [2, 0, 0, -10, 0, 2, 0, -10, 0, 0, 2, 0, 0, 0, 0, 1],
  16,
  new Uint8Array(Float32Array.from({ length: 1000 }, (_, i) => (i % 10) * 100).buffer),
)
const b = await chromium.launch({
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
  const p = await b.newPage(),
    errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('http://127.0.0.1:5183')
  const load = async (button, name) => {
    const event = p.waitForEvent('filechooser')
    await p.getByRole('button', { name: button, exact: true }).first().click()
    await (await event).setFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(fixture) })
  }
  const save = async () => {
    const event = p.waitForEvent('download')
    await p.getByRole('button', { name: 'Save project', exact: true }).click()
    return unpackProject(new Uint8Array(await fs.readFile(await (await event).path())))
  }
  await load('Load reference MRI…', 'first-mri.nii')
  await p.locator('.welcome').waitFor({ state: 'hidden', timeout: 30000 })
  await p.getByRole('heading', { name: 'Add images to this project' }).waitFor()
  assert.equal(await p.getByLabel('Anatomical image', { exact: true }).isDisabled(), true)
  assert.equal(
    await p
      .locator('.feature-panel')
      .getByRole('button', { name: 'Load reference CT…', exact: true })
      .count(),
    0,
  )
  await p.locator('button[data-feature="targets"]').click()
  await p.getByRole('button', { name: 'Add target at crosshair' }).click()
  const before = await save()
  await p.locator('button[data-feature="data"]').click()
  await load('Add aligned CT…', 'second-ct.nii')
  await p
    .getByRole('dialog', { name: 'Adjust second-ct.nii' })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  const selector = p.getByLabel('Anatomical image', { exact: true })
  await selector.waitFor()
  assert.equal(await selector.isDisabled(), false)
  assert.equal(await selector.locator('option').count(), 2)
  const after = await save()
  assert.equal(after.project.id, before.project.id)
  assert.deepEqual(after.project.frame, before.project.frame)
  assert.deepEqual(after.project.targets, before.project.targets)
  assert.equal(after.project.assets.length, 2)
  assert.equal(after.project.assets.find((a) => a.name === 'second-ct.nii').modality, 'ct')
  const id = after.project.assets.find((a) => a.modality === 'ct').id
  await selector.selectOption(id)
  assert.equal((await save()).project.display.anatomyAssetId, id)
  assert.deepEqual(errors, [])
  console.log(
    'Data MRI then CT preserves project, reference and targets; additive buttons replace destructive start controls and enable image switching.',
  )
} finally {
  await b.close()
}
