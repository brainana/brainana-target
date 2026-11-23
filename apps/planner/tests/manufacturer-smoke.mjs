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
  const snapshot = async () => {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save project', exact: true }).click()
    return (await unpackProject(new Uint8Array(await fs.readFile(await (await download).path())))).project
  }
  const expected = {
    np1: [10, 960, 1, 0.07, 0.024],
    'np2-single': [10, 1280, 1, 0.07, 0.024],
    'np2-four': [10, 1280, 4, 0.07, 0.024],
    'np-hd': [10, 6144, 1, 0.07, 0.024],
    'np-nhp-long': [45, 4416, 1, 0.07, 0.122],
    'np-nhp-short': [10, 960, 1, 0.07, 0.122],
    'plexon-u': [25, 16, 1, 0.185, 0.185],
    'plexon-nform': [3.5, 8, 4, 0.2, 0.125],
    'plexon-thumbtack': [3, 16, 1, 0.21, 0.21],
    'micro-lma': [50, 16, 1, 0.3, 0.3],
    'micro-fma': [3, 1, 36, 0.05, 0.05],
    'micro-mea': [10, 1, 16, 0.08, 0.08],
    utah: [1.5, 1, 100, 0.08, 0.08],
  }
  for (const [id, values] of Object.entries(expected)) {
    await page.getByLabel('Hardware preset', { exact: true }).selectOption(id)
    const e = (await snapshot()).electrodes[0],
      hw = e.hardware
    assert.deepEqual([e.length, e.contactCount, hw.rows * hw.columns, hw.width, hw.thickness], values, id)
    assert.equal(
      await page.getByLabel('Usable electrode length (mm)', { exact: true }).inputValue(),
      String(values[0]),
    )
    assert.equal(await page.getByRole('dialog').count(), 0, id)
  }
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('plexon-u')
  await page.getByLabel('Fluid capillaries', { exact: true }).selectOption('2')
  let p = await snapshot(),
    e = p.electrodes[0]
  assert.equal(e.diameter, 0.236)
  assert.equal(e.hardware.tipOffset, 0.41)
  assert.equal(e.hardware.configuration.reinforcementDiameter, 640)
  await page.getByLabel('Site arrangement', { exact: true }).selectOption('Tetrode')
  e = (await snapshot()).electrodes[0]
  assert.equal(e.hardware.sitePositions.length, 16)
  assert.ok(Math.abs(e.hardware.sitePositions[2][2] - 0.46) < 1e-10)
  await page.getByLabel('Recording contacts / channels', { exact: true }).selectOption('64')
  await page
    .getByRole('dialog')
    .getByText(/64-channel tetrode|at most 1/)
    .waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  assert.equal((await snapshot()).electrodes[0].contactCount, 16)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.equal(await page.getByLabel('Site arrangement', { exact: true }).inputValue(), 'Single')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  assert.equal(await page.getByLabel('Site arrangement', { exact: true }).inputValue(), 'Tetrode')
  await page.getByRole('button', { name: 'Add electrode', exact: true }).click()
  assert.equal(await page.getByLabel('Hardware preset', { exact: true }).inputValue(), 'custom-linear')
  p = await snapshot()
  await page.getByLabel('Electrode', { exact: true }).selectOption(p.electrodes[0].id)
  assert.equal(
    await page.getByLabel('Hardware preset', { exact: true }).inputValue(),
    'plexon-u',
    'selector must follow the actual selected device',
  )
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('micro-fma')
  await page.getByLabel('Physical needles / recording channels', { exact: true }).selectOption('18 / 16')
  await page.getByLabel('Traditional / HD pitch (µm)', { exact: true }).selectOption('250')
  await page.getByLabel('Needle length pattern', { exact: true }).selectOption('Slanted')
  e = (await snapshot()).electrodes[0]
  assert.equal(e.hardware.shankLengths.length, 18)
  assert.equal(e.hardware.shankLengths[0], 1)
  assert.equal(e.hardware.shankLengths[5], 3)
  await page.getByText('Edit all individual needle lengths', { exact: true }).click()
  const lengths = e.hardware.shankLengths.map((x, i) => (i === 0 ? 2 : x))
  await page.getByLabel('Individual shaft lengths (mm)', { exact: true }).fill(lengths.join(', '))
  await page.getByRole('button', { name: 'Apply individual lengths', exact: true }).click()
  e = (await snapshot()).electrodes[0]
  assert.equal(e.hardware.shankLengths[0], 2)
  assert.equal(e.hardware.configuration.lengthProfile, 'Individual lengths')
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('custom-linear')
  await page.getByText('Custom site map / variable spacing', { exact: true }).click()
  await page
    .getByLabel('Explicit site centres (mm)', { exact: true })
    .fill('0, 0.15, 0.1\n0, -0.15, 0.5\n0, 0.15, 1.2')
  await page.getByRole('button', { name: 'Apply explicit site map', exact: true }).click()
  e = (await snapshot()).electrodes[0]
  assert.deepEqual(e.hardware.sitePositions, [
    [0, 0.15, 0.1],
    [0, -0.15, 0.5],
    [0, 0.15, 1.2],
  ])
  await page.getByRole('button', { name: 'Inspect device geometry', exact: true }).click()
  await page.screenshot({
    path: '/tmp/hardware-custom-sites.png',
  })
  await page.getByRole('button', { name: 'Close device view', exact: true }).click()
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('plexon-u')
  await page.getByLabel('Fluid capillaries', { exact: true }).selectOption('2')
  await page.getByLabel('Hardware preset', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '/tmp/hardware-manufacturer-options.png',
  })
  assert.deepEqual(errors, [])
  console.log(
    '  ok - 14 presets apply physical dimensions; manufacturer changes, rejected options, Undo/Redo, device switching, individual lengths and custom site maps persist',
  )
} finally {
  await browser.close()
}
