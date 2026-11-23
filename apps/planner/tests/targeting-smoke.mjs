import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { unpackProject } from '../src/data/archive.ts'
import fs from 'node:fs/promises'
import { NVImage } from '@niivue/niivue'
const launchBrowser = () =>
  chromium.launch({
    ...(process.env.PLANNER_HEADLESS_SHELL ? {} : { channel: 'chrome' }),
    headless: true,
    args: [
      ...(process.env.PLANNER_SINGLE_PROCESS ? ['--single-process', '--in-process-gpu'] : []),
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  })
const browser = await launchBrowser()
let page
try {
  page = await browser.newPage()
  await page.goto('http://127.0.0.1:5183')
  await page.locator('.startup').waitFor({ state: 'hidden' })
  assert.equal(await page.title(), 'BrainanaTarget')
  await page.getByRole('button', { name: 'Guided tutorial', exact: true }).first().click()
  const guide = page.getByRole('region', { name: 'Guided planning' })
  assert.equal(await guide.getByRole('button', { name: 'Next step' }).isDisabled(), true)
  await page.locator('.guide-region').waitFor({ state: 'visible' })
  await page.locator('.guide-action').waitFor({ state: 'visible' })
  const startBounds = await page.getByRole('region', { name: 'Start a project' }).boundingBox()
  const guideBounds = await page.locator('.guide-region').boundingBox()
  assert.ok(Math.abs(startBounds.x - guideBounds.x) <= 4)
  assert.ok(Math.abs(startBounds.width - guideBounds.width) <= 7)
  await page.screenshot({
    path: '/tmp/guide-start-boundaries.png',
    fullPage: true,
  })

  const phantom = NVImage.createNiftiArray(
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
  ).setFiles({ name: 'phantom.nii', mimeType: 'application/octet-stream', buffer: Buffer.from(phantom) })
  await guide.getByRole('heading', { name: 'Optional: load an atlas' }).waitFor()
  await page.getByLabel('Atlas overlay', { exact: true }).selectOption('import')
  const atlasDialog = page.getByRole('dialog', { name: 'Load an aligned atlas' })
  await atlasDialog.getByText(/must already be registered/).waitFor()
  await atlasDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await page.getByLabel('Atlas overlay', { exact: true }).inputValue(), '')
  await page.getByRole('button', { name: 'Load aligned atlas…', exact: true }).click()
  const atlasVolume = NVImage.createNiftiArray(
    [32, 32, 32],
    [1, 1, 1],
    undefined,
    2,
    new Uint8Array(32 ** 3).fill(3),
  )
  await atlasDialog.getByLabel('Aligned atlas image', { exact: true }).setInputFiles({
    name: 'regions.nii',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(atlasVolume),
  })
  await atlasDialog.getByLabel('Atlas name', { exact: true }).fill('Test atlas')
  await atlasDialog.getByLabel('Atlas label table (optional)', { exact: true }).setInputFiles({
    name: 'labels.tsv',
    mimeType: 'text/tab-separated-values',
    buffer: Buffer.from('ID\tname\n3\tTest region\n'),
  })
  await atlasDialog.getByRole('button', { name: 'Load atlas', exact: true }).click()
  await atlasDialog.waitFor({ state: 'hidden' })
  await page.locator('.atlas-readout').filter({ hasText: 'Test atlas · Test region' }).waitFor()
  assert.equal(await page.getByLabel('Atlas overlay', { exact: true }).inputValue(), 'cached')
  await guide.getByRole('button', { name: 'Next step', exact: true }).click()
  await guide.getByRole('heading', { name: 'Choose a target' }).waitFor()
  await page.locator('.guide-region').filter({ hasText: 'Choose a target' }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Add target at crosshair' }).click()
  await guide.getByRole('heading', { name: 'Optional: draw exclusions' }).waitFor()
  await guide.getByRole('button', { name: 'Hide tutorial' }).click()
  assert.equal(await page.locator('.guide-region').isVisible(), false)
  assert.equal(await page.locator('.guide-action').isVisible(), false)
  await page.locator('button[data-feature="chamber"]').click()
  assert.equal(await page.getByLabel('Planning target', { exact: true }).count(), 0)
  await page.locator('button[data-feature="electrodes"]').click()
  assert.equal(await page.getByLabel('Planning target', { exact: true }).count(), 0)
  await page.getByLabel('Usable electrode length (mm)', { exact: true }).fill('10')
  await page.getByLabel('Usable electrode length (mm)', { exact: true }).press('Tab')
  assert.equal(await page.getByLabel('Depth from grid plane (mm)', { exact: true }).inputValue(), '10')
  await page.locator('button[data-feature="positioning"]').click()
  await page.getByLabel('Planning target', { exact: true }).selectOption({ label: 'Target 1' })
  await page.getByRole('button', { name: 'Find chamber placements around restrictions' }).click()
  await page.getByText(/Load an anatomical surface before searching/).waitFor()
  await page.getByLabel('Chamber situation', { exact: true }).selectOption('existing')
  await page.getByRole('button', { name: 'Find trajectories through existing chamber' }).click()
  await page.getByText(/No feasible placement/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Apply candidate 1', exact: true }).count(), 0)
  await page.locator('button[data-feature="electrodes"]').click()
  await page.getByLabel('Usable electrode length (mm)', { exact: true }).fill('60')
  await page.getByLabel('Usable electrode length (mm)', { exact: true }).press('Tab')
  await page.locator('button[data-feature="positioning"]').click()
  await page.getByRole('button', { name: 'Find trajectories through existing chamber' }).click()
  await page.getByRole('button', { name: 'Locate target', exact: true }).click()
  await page.locator('button[data-feature="chamber"]').click()
  await page.locator('button[data-feature="positioning"]').click()
  await page.getByRole('button', { name: 'Apply candidate 1', exact: true }).click()
  assert.match(
    await page.locator('.readout').filter({ hasText: 'Tip-to-target error' }).innerText(),
    /0.00 mm/,
  )
  console.log(
    'ok - separate specification and positioning panels enforce usable electrode length and preserve search results',
  )
  await page.locator('button[data-feature="chamber"]').click()
  await page.getByLabel('Bore size examples', { exact: true }).selectOption('19')
  assert.equal(await page.getByLabel('Inner radius (mm)', { exact: true }).inputValue(), '9.5')
  const origin = await Promise.all(
    ['R (mm)', 'A (mm)', 'S (mm)'].map(async (name) =>
      Number(await page.getByLabel(name, { exact: true }).inputValue()),
    ),
  )
  const vertices = [],
    faces = []
  const side = 61
  for (let y = -30; y <= 30; y++)
    for (let x = -30; x <= 30; x++)
      vertices.push(`v ${origin[0] + x} ${origin[1] + y} ${origin[2] - 15 - 0.005 * x * x - 0.001 * y * y}`)
  for (let y = 0; y < 60; y++)
    for (let x = 0; x < 60; x++) {
      const a = 1 + x + y * side
      faces.push(`f ${a} ${a + 1} ${a + side}`, `f ${a + 1} ${a + side + 1} ${a + side}`)
    }
  const skullChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Load aligned skull surface…', exact: true }).click()
  await (
    await skullChooser
  ).setFiles({
    name: 'skull.obj',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([...vertices, ...faces].join('\n')),
  })
  await page.locator('.readout').filter({ hasText: 'Fitting surface' }).filter({ hasText: 'Skull' }).waitFor()
  const poseBeforeFit = await Promise.all(
    ['R (mm)', 'A (mm)', 'S (mm)', 'X tilt (°)', 'Y tilt (°)', 'Z rotation (°)'].map((name) =>
      page.getByLabel(name, { exact: true }).inputValue(),
    ),
  )
  await page.getByRole('button', { name: 'Conform base to surface', exact: true }).click()
  await page.getByText('Skull-contoured rim', { exact: true }).waitFor()
  const poseAfterFit = await Promise.all(
    ['R (mm)', 'A (mm)', 'S (mm)', 'X tilt (°)', 'Y tilt (°)', 'Z rotation (°)'].map((name) =>
      page.getByLabel(name, { exact: true }).inputValue(),
    ),
  )
  assert.deepEqual(poseAfterFit, poseBeforeFit)
  await page.screenshot({
    path: '/tmp/chamber-curvature.png',
    fullPage: true,
  })
  await page.getByText('Autosaved locally', { exact: true }).waitFor()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  const download = await downloadEvent
  const saved = await unpackProject(new Uint8Array(await fs.readFile(await download.path())))
  assert.equal(saved.project.electrodes[0].length, 60)
  assert.equal(saved.project.chambers[0].baseFit.source, 'skull')
  assert.equal(saved.project.chambers[0].baseFit.outerDepths.length, 64)
  assert.ok(
    Math.max(...saved.project.chambers[0].baseFit.outerDepths) -
      Math.min(...saved.project.chambers[0].baseFit.outerDepths) >
      0.2,
  )
  assert.deepEqual(saved.project.targets[0].atlas, { name: 'Test atlas', label: 'Test region' })
  assert.ok(saved.project.assets.find((a) => a.role === 'atlas').atlasInfo.tsv.includes('Test region'))
  await page.reload()
  await page.locator('.startup').waitFor({ state: 'hidden' })
  await page.locator('.welcome').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Resume previous autosave', exact: true }).click()
  await page.locator('.welcome').waitFor({ state: 'hidden' })
  assert.equal(await page.getByLabel('Atlas overlay', { exact: true }).inputValue(), 'cached')
  await page.locator('button[data-feature="electrodes"]').click()
  assert.equal(await page.getByLabel('Usable electrode length (mm)', { exact: true }).inputValue(), '60')
  await page.locator('button[data-feature="chamber"]').click()
  await page.getByText('Skull-contoured rim', { exact: true }).waitFor()
  console.log(
    'ok - imported skull curvature fits the rim without moving the top plane and survives export/resume',
  )
  await page.getByRole('button', { name: 'New project', exact: true }).click()
  await page.locator('.welcome').waitFor({ state: 'visible' })
  await page.reload()
  await page.locator('.startup').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.project-title').innerText(), 'No project loaded')
  console.log('ok - shaft length survives export and explicit resume; reload starts fresh')
} catch (error) {
  console.log(await page.locator('body').innerText())
  await page.screenshot({
    path: new URL('../../../../planner-optimization-preview.png', import.meta.url).pathname,
    fullPage: true,
  })
  throw error
} finally {
  await browser.close()
}
