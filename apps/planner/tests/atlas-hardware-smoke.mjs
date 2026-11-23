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
  const page = await browser.newPage({ viewport: { width: 1350, height: 950 } })
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (/WebGL: INVALID_|ERROR: 0:/.test(m.text())) errors.push(m.text())
  })
  await page.goto('http://127.0.0.1:5183')
  await page.locator('.startup').waitFor({ state: 'hidden' })
  const anatomy = NVImage.createNiftiArray(
    [32, 32, 32],
    [1, 1, 1],
    undefined,
    2,
    Uint8Array.from({ length: 32 ** 3 }, (_, i) => {
      const distance = Math.hypot(
        (i % 32) - 15.5,
        (Math.floor(i / 32) % 32) - 15.5,
        Math.floor(i / 1024) - 15.5,
      )
      return distance < 12 ? 80 + (12 - distance) * 10 : 0
    }),
  )
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Load reference MRI…', exact: true }).first().click()
  await (
    await chooser
  ).setFiles({ name: 'phantom.nii', mimeType: 'application/octet-stream', buffer: Buffer.from(anatomy) })
  await page.locator('button[data-feature="electrodes"]').click()
  const snapshot = async () => {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save project', exact: true }).click()
    return (await unpackProject(new Uint8Array(await fs.readFile(await (await download).path())))).project
  }

  await page.locator('#app').getByLabel('Hardware preset', { exact: true }).selectOption('plexon-u')
  const config = page.getByRole('dialog', { name: 'Configure electrode hardware' })
  assert.equal(
    await config
      .getByLabel('Hardware preset', { exact: true })
      .locator('option')
      .filter({ hasText: 'Plexon U-Probe' })
      .count(),
    1,
  )
  await config.getByLabel('Recording contacts / channels', { exact: true }).selectOption('64')
  await config.getByLabel('Site arrangement', { exact: true }).selectOption('Stereotrode')
  const pitch = config.getByLabel('Site / group pitch (µm)', { exact: true })
  assert.deepEqual(await pitch.locator('option').allTextContents(), [
    'Choose site / group pitch (µm)…',
    '100',
    '150',
  ])
  await pitch.selectOption('100')
  assert.equal(await config.locator('canvas').count(), 1, 'Preview before confirmation')
  const previewBefore = await config.locator('canvas').screenshot()
  await config.getByLabel('Recording contacts / channels', { exact: true }).selectOption('16')
  assert.notDeepEqual(await config.locator('canvas').screenshot(), previewBefore)
  await config.getByRole('button', { name: 'Cancel configuration', exact: true }).click()
  await page.locator('#app').getByLabel('Hardware preset', { exact: true }).selectOption('custom-array')
  const customBefore = await config.locator('canvas').screenshot()
  await config.getByLabel('Recording contacts per shaft', { exact: true }).fill('4')
  await config.getByLabel('Recording contacts per shaft', { exact: true }).dispatchEvent('change')
  await config.getByLabel('Contact spacing (µm)', { exact: true }).fill('200')
  await config.getByLabel('Contact spacing (µm)', { exact: true }).dispatchEvent('change')
  assert.notDeepEqual(await config.locator('canvas').screenshot(), customBefore)
  await config.getByRole('button', { name: 'Use these device specifications', exact: true }).click()
  await config.getByRole('button', { name: 'Apply electrode configuration', exact: true }).click()
  assert.equal((await snapshot()).electrodes[0].contactCount, 4)
  assert.equal((await snapshot()).electrodes[0].contactSpacing, 0.2)
  await page.locator('#app').getByLabel('Hardware preset', { exact: true }).selectOption('custom-tungsten')
  assert.equal(await config.locator('canvas').count(), 1)
  assert.equal(await config.getByLabel('Recording contacts per shaft', { exact: true }).count(), 0)
  await config.getByRole('button', { name: 'Use these device specifications', exact: true }).click()
  await config.getByRole('button', { name: 'Apply electrode configuration', exact: true }).click()
  assert.equal((await snapshot()).electrodes[0].contactCount, 1)
  const baseline = await snapshot()
  await page.getByRole('button', { name: 'Atlas explorer', exact: true }).click()
  const atlas = page.getByRole('dialog', { name: 'Atlas explorer', exact: true })
  await atlas.getByRole('button', { name: 'Load aligned atlas…', exact: true }).click()
  const importer = page.getByRole('dialog', { name: 'Load an aligned atlas', exact: true })
  const data = NVImage.createNiftiArray(
    [32, 32, 32],
    [1, 1, 1],
    undefined,
    2,
    Uint8Array.from({ length: 32 ** 3 }, (_, i) => (i % 32 < 16 ? 1 : 2)),
  )
  await importer
    .getByLabel('Aligned atlas image', { exact: true })
    .setInputFiles({ name: 'atlas.nii', mimeType: 'application/octet-stream', buffer: Buffer.from(data) })
  await importer.getByLabel('Atlas label table (optional)', { exact: true }).setInputFiles({
    name: 'labels.tsv',
    mimeType: 'text/tab-separated-values',
    buffer: Buffer.from(
      [
        ['ID', 'name', 'color'],
        ['1', 'First region', '#ff0000'],
        ['2', 'Second region', '#00ff00'],
      ]
        .map((r) => r.join(String.fromCharCode(9)))
        .join(String.fromCharCode(10)),
    ),
  })
  await importer.getByRole('button', { name: 'Load atlas', exact: true }).click()
  await importer.waitFor({ state: 'hidden' })
  await atlas.getByLabel('Search atlas regions', { exact: true }).fill('Second')
  assert.equal(await atlas.getByRole('list', { name: 'Atlas regions' }).getByRole('button').count(), 1)
  await atlas.getByRole('button', { name: '2 · Second region', exact: true }).click()
  await atlas.getByRole('button', { name: 'Locate selected region', exact: true }).click()
  assert.match(await atlas.locator('p').filter({ hasText: 'Crosshair:' }).textContent(), /Second region/)
  const slice = page.getByLabel('Orthogonal MRI slices', { exact: true })
  const capture = async () => {
    await atlas.getByRole('button', { name: 'Close atlas explorer', exact: true }).click()
    const png = await slice.screenshot()
    await page.getByRole('button', { name: 'Atlas explorer', exact: true }).click()
    return png
  }
  const overlay = await capture()
  await atlas.getByRole('button', { name: 'Show none', exact: true }).click()
  const noRegions = await capture()
  assert.notDeepEqual(noRegions, overlay)
  assert.match(await atlas.getByText(/regions visible/).textContent(), /0 of 2 regions visible/)
  await atlas.getByRole('button', { name: 'Show all', exact: true }).click()
  assert.deepEqual(await capture(), overlay, 'Show all includes regions outside the search filter')
  await atlas.getByLabel('Show atlas region 2 · Second region', { exact: true }).uncheck()
  assert.match(await atlas.getByText(/regions visible/).textContent(), /1 of 2 regions visible/)
  const firstOnly = await capture()
  await atlas.getByRole('button', { name: 'Invert', exact: true }).click()
  assert.equal(
    await atlas.getByLabel('Show atlas region 2 · Second region', { exact: true }).isChecked(),
    true,
  )
  assert.notDeepEqual(await capture(), firstOnly)
  await atlas.getByRole('button', { name: 'Show all', exact: true }).click()

  await atlas.getByLabel('Atlas outlines only', { exact: true }).check()
  assert.notDeepEqual(await capture(), overlay)
  await atlas.getByLabel('Atlas outlines only', { exact: true }).uncheck()
  await atlas.getByLabel('Isolate selected atlas region', { exact: true }).check()
  assert.notDeepEqual(await capture(), overlay)
  await atlas.getByLabel('Isolate selected atlas region', { exact: true }).uncheck()
  await atlas.getByLabel('Atlas opacity', { exact: true }).evaluate((input) => {
    input.value = '.8'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.notDeepEqual(await capture(), overlay)
  const oldBounds = await atlas.boundingBox(),
    title = atlas.getByRole('heading', { name: 'Atlas explorer · drag to move' })
  await title.focus()
  await title.press('ArrowRight')
  await title.press('ArrowDown')
  const newBounds = await atlas.boundingBox()
  assert.equal(newBounds.x, oldBounds.x + 20)
  assert.equal(newBounds.y, oldBounds.y + 20)
  await atlas.getByRole('button', { name: 'Add target in selected region', exact: true }).click()
  const after = await snapshot()
  assert.equal(after.targets.at(-1).name, 'Second region')
  for (const key of ['chambers', 'grids', 'electrodes', 'avoidRegions'])
    assert.deepEqual(after[key], baseline[key])
  await page.screenshot({ path: '/tmp/atlas-explorer.png' })
  assert.deepEqual(errors, [])
  console.log(
    '  ok - one U-Probe family, dependent choices, live preliminary previews, custom contacts/spacing and single tungsten configuration',
  )
  console.log(
    '  ok - movable atlas explorer loads/searches labels, isolates regions, changes opacity/outlines and adds an in-region target without moving hardware',
  )
} finally {
  await browser.close()
}
