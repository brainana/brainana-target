import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { NVImage } from '@niivue/niivue'
import { gzipSync } from 'fflate'
import { unpackProject } from '../src/data/archive.ts'
const dims = [10, 10, 10],
  data = Float32Array.from({ length: 1000 }, (_, i) => (i % 10 < 3 ? 1000 : 50))
const nifti = NVImage.createNiftiArray(
  dims,
  [2, 2, 2],
  [2, 0, 0, 10, 0, 2, 0, 20, 0, 0, 2, 30, 0, 0, 0, 1],
  16,
  new Uint8Array(data.buffer),
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
  const page = await browser.newPage()
  for (const modality of ['MRI', 'CT']) {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('http://127.0.0.1:5183')
    const chooser = page.waitForEvent('filechooser')
    await page
      .getByRole('button', { name: `Load reference ${modality}…`, exact: true })
      .first()
      .click()
    const input = await chooser
    const accept = await input.element().getAttribute('accept')
    assert.ok(accept.split(',').includes('.gz'))
    assert.ok(!accept.includes('.nii.gz'))
    await input.setFiles({
      name: `reference-${modality}.nii.gz`,
      mimeType: 'application/gzip',
      buffer: Buffer.from(gzipSync(nifti)),
    })
    await page.locator('.welcome').waitFor({ state: 'hidden', timeout: 30000 })
    await page.locator('button[data-feature="images"]').click()
    await page.getByText(`Reference ${modality}`, { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Adjust image…', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Adjust reference-${modality}.nii.gz` })
    if (modality === 'CT') {
      await dialog.getByRole('button', { name: 'Build / update skull preview' }).click()
      await dialog.getByText('Display updated live. Changes are saved with the project.').waitFor()
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await page.locator('button[data-feature="targets"]').click()
    await page.getByRole('button', { name: 'Add target at crosshair' }).click()
    const event = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save project', exact: true }).click()
    const path = await (await event).path()
    const bundle = await unpackProject(new Uint8Array(await fs.readFile(path)))
    const reference = bundle.project.assets.find((a) => a.id === bundle.project.frame.referenceAssetId)
    assert.equal(reference.modality, modality.toLowerCase())
    assert.equal(reference.role, 'anatomy')
    assert.equal(bundle.project.targets.length, 1)
    if (modality === 'CT') assert.ok(reference.imageDisplay.skull)
    const reopen = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Open project', exact: true }).click()
    await (
      await reopen
    ).setFiles({
      name: 'saved.brainana-plan',
      mimeType: 'application/octet-stream',
      buffer: await fs.readFile(path),
    })
    await page.waitForTimeout(1000)
    await page.locator('button[data-feature="images"]').click()
    await page.getByText(`Reference ${modality}`, { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log(
      `${modality} compressed reference import, native filter, target, image controls, archive and reopen passed.`,
    )
  }
} finally {
  await browser.close()
}
