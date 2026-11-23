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

  const initial = await snapshot(),
    center = initial.chambers[0].pose.origin.map((v, i) => v - (i === 2 ? 30 : 0))
  await page.locator('button[data-feature="chamber"]').click()
  for (const [label, value] of [
    ['R', center[0] + 20],
    ['A', center[1] + 2],
    ['S', center[2] - 3],
  ]) {
    const input = page.getByLabel(`${label} (mm)`, { exact: true })
    await input.fill(String(value))
    await input.dispatchEvent('change')
    await input.press('Tab')
    await page.waitForTimeout(80)
  }
  const vertices = [],
    faces = [],
    side = 41
  for (let y = -20; y <= 20; y++)
    for (let x = -20; x <= 20; x++)
      vertices.push([center[0] + 10 - 0.02 * x * x - 0.04 * y * y, center[1] + y, center[2] - x].join(' '))
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 40; x++) {
      const i = x + y * side
      faces.push(`3 ${i} ${i + 1} ${i + side}`, `3 ${i + 1} ${i + side + 1} ${i + side}`)
    }
  const ply = [
    'ply',
    'format ascii 1.0',
    `element vertex ${vertices.length}`,
    'property float x',
    'property float y',
    'property float z',
    `element face ${faces.length}`,
    'property list uchar int vertex_indices',
    'end_header',
    ...vertices,
    ...faces,
  ].join(String.fromCharCode(10))
  const choose = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Load aligned skull surface…', exact: true }).click()
  await (
    await choose
  ).setFiles({ name: 'lateral-skull.ply', mimeType: 'application/octet-stream', buffer: Buffer.from(ply) })
  await page.getByRole('button', { name: 'Conform base to surface', exact: true }).click()
  const error = page.getByRole('dialog').filter({ hasText: 'Could not complete this action' })
  await error.waitFor()
  await error.getByRole('button', { name: 'Close', exact: true }).click()
  const before = await snapshot()
  await page.getByRole('button', { name: 'Preview surface-aligned chamber', exact: true }).click()
  await page.locator('.placement-preview').getByRole('button', { name: 'Place chamber here', exact: true }).waitFor()
  assert.deepEqual((await snapshot()).chambers, before.chambers, 'Preview does not change saved geometry')
  await page.locator('.placement-preview').getByRole('button', { name: 'Place chamber here', exact: true }).click()
  const aligned = await snapshot()
  assert.ok(aligned.chambers[0].baseFit, 'Explicit new fit survives pose invalidation')
  assert.ok(Math.abs(aligned.chambers[0].pose.angles[1]) > 60)
  assert.ok(
    Math.max(...aligned.chambers[0].baseFit.outerDepths) -
      Math.min(...aligned.chambers[0].baseFit.outerDepths) >
      0.1,
  )
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.deepEqual((await snapshot()).chambers, before.chambers)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  assert.deepEqual((await snapshot()).chambers, aligned.chambers)
  await page.locator('button[data-feature="electrodes"]').click()
  await page.getByLabel('Enable guide tube', { exact: true }).check()
  const tube = await snapshot()
  assert.ok(tube.electrodes[0].guideTube)
  const distal = page.getByLabel('Tube distal-end depth from grid (mm)', { exact: true })
  await distal.fill('15')
  await distal.dispatchEvent('change')
  assert.equal((await snapshot()).electrodes[0].guideTube.tipDepth, 15)
  await page.getByRole('button', { name: '3D visibility controls', exact: true }).click()
  const visibility = page.getByLabel('Show guide tubes in 3D', { exact: true })
  assert.equal(await visibility.isEnabled(), true)
  await page.getByRole('button', { name: '3D visibility controls', exact: true }).click()
  const canvas = page.getByLabel('Three-dimensional anatomy and chamber', { exact: true }),
    withTube = await canvas.screenshot()
  await page.getByRole('button', { name: '3D visibility controls', exact: true }).click()
  await visibility.uncheck()
  await page.getByRole('button', { name: '3D visibility controls', exact: true }).click()
  assert.notDeepEqual(await canvas.screenshot(), withTube)
  await page.screenshot({
    path: '/tmp/lateral-chamber-guide-tube.png',
  })
  await page.getByRole('button', { name: '3D visibility controls', exact: true }).click()
  await visibility.check()
  await page.getByRole('button', { name: '3D visibility controls', exact: true }).click()
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('micro-fma')
  const config = page.getByRole('dialog', { name: 'Configure electrode hardware' })
  await config.getByLabel('Confirm FMA electrode variant', { exact: true }).selectOption('18 / 16')
  await config.locator('[data-setup-key="pitch"] select').selectOption('400')
  await config.locator('[data-setup-key="lengthProfile"] select').selectOption('Uniform')
  await config.getByRole('button', { name: 'Use these device specifications', exact: true }).click()
  assert.equal(await config.getByLabel('Enable guide tube', { exact: true }).isDisabled(), true)
  await config.getByRole('button', { name: 'Cancel configuration', exact: true }).click()
  assert.deepEqual(errors, [])
  console.log(
    '  ok - unsupported lateral chamber is rotated and contoured through a preview; apply/save/undo/redo preserve the rim fit',
  )
  console.log(
    '  ok - guide tube parameters persist, change 3D geometry and are unavailable for fixed-footprint arrays',
  )
} finally {
  await browser.close()
}
