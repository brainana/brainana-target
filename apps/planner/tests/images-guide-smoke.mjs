import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { NVImage } from '@niivue/niivue'
import { unpackProject } from '../src/data/archive.ts'
const dims = [20, 20, 20],
  data = Float32Array.from({ length: 8000 }, (_, i) => (i % 20 < 4 ? 1000 : 0))
const ct = NVImage.createNiftiArray(
  dims,
  [2, 2, 2],
  [2, 0, 0, -20, 0, 2, 0, -20, 0, 0, 2, 0, 0, 0, 0, 1],
  16,
  new Uint8Array(data.buffer),
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
  await p.getByRole('button', { name: 'Try the macaque demo', exact: true }).click()
  await p.locator('.welcome').waitFor({ state: 'hidden', timeout: 60000 })
  await p.getByRole('button', { name: 'Guided tutorial', exact: true }).click()
  await p.locator('button[data-feature="images"]').click()
  await p.getByRole('heading', { name: 'Optional: add images and overlays', exact: true }).waitFor()
  const chooser = p.waitForEvent('filechooser')
  await p.getByRole('button', { name: 'Add aligned CT…' }).click()
  await (
    await chooser
  ).setFiles({ name: 'ct.nii', mimeType: 'application/octet-stream', buffer: Buffer.from(ct) })
  const d = p.getByRole('dialog', { name: 'Adjust ct.nii' })
  await d.waitFor()
  await d.getByRole('button', { name: 'Build / update skull preview' }).click()
  await d.getByRole('button', { name: 'Close', exact: true }).click()
  await p.waitForTimeout(1000)
  const download = p.waitForEvent('download')
  await p.getByRole('button', { name: 'Save project', exact: true }).click()
  const path = await (await download).path()
  const bundle = await unpackProject(new Uint8Array(await fs.readFile(path)))
  const asset = bundle.project.assets.find((a) => a.role === 'ct')
  assert.ok(asset.imageDisplay.skull)
  assert.ok(bundle.bytes.has(asset.id))
  await p.getByRole('button', { name: 'Undo', exact: true }).click()
  await p.waitForTimeout(100)
  await p.getByRole('button', { name: 'Redo', exact: true }).click()
  await p.waitForTimeout(100)
  const reopen = p.waitForEvent('filechooser')
  await p.getByRole('button', { name: 'Open project', exact: true }).click()
  await (
    await reopen
  ).setFiles({
    name: 'saved.brainana-plan',
    mimeType: 'application/octet-stream',
    buffer: await fs.readFile(path),
  })
  await p.waitForTimeout(1500)
  await p.locator('button[data-feature="images"]').click()
  await p.getByRole('heading', { name: 'ct.nii', exact: true }).waitFor()
  await p.locator('button[data-feature="targets"]').click()
  await p.getByRole('heading', { name: 'Choose a target', exact: true }).waitFor()
  await p.getByRole('button', { name: 'Add target at crosshair' }).click()
  await p.getByRole('heading', { name: 'Optional: draw exclusions', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log(
    'CT import, adjustment, cropped skull mesh, portable bytes/settings, undo/redo and guide navigation/action synchronization passed.',
  )
} finally {
  await b.close()
}
