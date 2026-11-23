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
  const before = await snapshot()
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('micro-fma')
  const dialog = page.getByRole('dialog', { name: 'Configure electrode hardware' })
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'Cancel configuration', exact: true }).click()
  assert.deepEqual((await snapshot()).electrodes, before.electrodes)
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('micro-fma')
  const finishSetup = async (id, overrides = {}) => {
    const confirm = dialog.getByRole('button', { name: 'Use these device specifications', exact: true })
    if (!(await confirm.count())) return
    if (await dialog.locator('.hardware-setup select').count())
      assert.equal(await dialog.locator('canvas').count(), 0, `${id}: missing choices hide preview`)
    assert.equal(
      await dialog.locator('.needle-length-table').count(),
      0,
      `${id}: per-electrode fields hidden`,
    )
    assert.equal(
      await dialog.getByRole('button', { name: 'Apply electrode configuration', exact: true }).isDisabled(),
      true,
    )
    const choices = {
      'plexon-u': { channels: '16', layout: 'Single', spacing: '100' },
      'plexon-nform': { generation: 'GEN2 / 500 µm', lengthProfile: 'Uniform' },
      'plexon-thumbtack': { channels: '16' },
      'micro-fma': { shafts: '36 / 32', pitch: '400', lengthProfile: 'Uniform' },
      'micro-mea': { lengthProfile: 'Uniform' },
      utah: { layout: '10 × 10', lengthProfile: 'Uniform', length: '1.5' },
    }
    for (const [key, value] of Object.entries({ ...choices[id], ...overrides }))
      await dialog.locator(`[data-setup-key="${key}"] select`).selectOption(value)
    assert.equal(
      await dialog.locator('canvas').count(),
      1,
      `${id}: valid specifications show preview before confirmation`,
    )
    await confirm.click()
    await dialog.locator('canvas').waitFor()
    assert.equal(
      await dialog.getByRole('button', { name: 'Apply electrode configuration', exact: true }).isEnabled(),
      true,
    )
  }
  assert.equal(
    await dialog.getByRole('button', { name: 'Use these device specifications', exact: true }).isDisabled(),
    true,
  )
  await dialog.getByLabel('Confirm FMA electrode variant', { exact: true }).selectOption('18 / 16')
  assert.equal(await dialog.locator('canvas').count(), 0)
  await finishSetup('micro-fma', { shafts: '18 / 16' })
  const uniform = dialog.getByLabel('Uniform electrode length (mm)', { exact: true })
  await uniform.fill('0.5')
  await uniform.dispatchEvent('change')
  assert.deepEqual(
    await dialog
      .getByLabel('Electrode length configuration', { exact: true })
      .locator('option')
      .allTextContents(),
    ['Uniform', 'Slanted', 'Staggered', 'Clustered', 'Individual lengths'],
  )
  await uniform.fill('3')
  await uniform.dispatchEvent('change')
  await dialog
    .getByLabel('Electrode length configuration', { exact: true })
    .selectOption('Individual lengths')
  await page.waitForFunction(
    () => globalThis.document.activeElement?.closest('[data-followup="individual-lengths"]') !== null,
  )
  const bounds = await dialog.getByLabel('Electrode 1 · row 1, column 1 (mm)', { exact: true }).boundingBox()
  const scroller = await dialog.locator('.electrode-configurator-content').boundingBox()
  assert.ok(bounds.y >= scroller.y && bounds.y + bounds.height <= scroller.y + scroller.height)
  await dialog.getByLabel('Electrode length configuration', { exact: true }).selectOption('Slanted')
  await page.waitForFunction(
    () => globalThis.document.activeElement?.closest('[data-followup="shortLength"]') !== null,
  )
  await dialog
    .getByLabel('Electrode length configuration', { exact: true })
    .selectOption('Individual lengths')
  await page.waitForFunction(
    () => globalThis.document.activeElement?.closest('[data-followup="individual-lengths"]') !== null,
  )
  // Select the far upper-right footprint point, then check the matching numbered input.
  await dialog.locator('canvas').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(
      new globalThis.MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + (660 / 760) * rect.width,
        clientY: rect.top + (100 / 520) * rect.height,
      }),
    )
  })
  await page.waitForFunction(
    () => globalThis.document.activeElement?.closest('[data-followup="individual-length-17"]') !== null,
  )
  assert.equal(
    await dialog
      .locator('[data-followup="individual-length-17"]')
      .evaluate((field) => field.classList.contains('followup-highlight')),
    true,
  )
  const selectedBounds = await dialog
    .getByLabel('Electrode 18 · row 3, column 6 (mm)', { exact: true })
    .boundingBox()
  const selectedScroller = await dialog.locator('.electrode-configurator-content').boundingBox()
  assert.ok(
    selectedBounds.y >= selectedScroller.y &&
      selectedBounds.y + selectedBounds.height <= selectedScroller.y + selectedScroller.height,
  )
  await dialog.getByLabel('Electrode length configuration', { exact: true }).selectOption('Uniform')
  const needle = dialog.getByLabel('Electrode 1 · row 1, column 1 (mm)', { exact: true })
  await needle.fill('2')
  await needle.dispatchEvent('change')
  assert.equal(
    await dialog.getByLabel('Electrode length configuration', { exact: true }).inputValue(),
    'Individual lengths',
  )
  assert.equal(
    await dialog.getByLabel('Electrode 2 · row 1, column 2 (mm)', { exact: true }).inputValue(),
    '3',
  )
  await dialog.getByRole('button', { name: 'Apply electrode configuration', exact: true }).click()
  const configured = (await snapshot()).electrodes[0]
  assert.equal(configured.hardware.rows * configured.hardware.columns, 18)
  assert.equal(configured.hardware.recordingChannels, 16)
  assert.equal(configured.hardware.shankLengths[0], 2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.deepEqual((await snapshot()).electrodes, before.electrodes)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  assert.equal((await snapshot()).electrodes[0].hardware.shankLengths[0], 2)
  await page.getByRole('button', { name: 'Configure electrode hardware', exact: true }).click()
  assert.equal(
    await dialog.getByRole('button', { name: 'Use these device specifications', exact: true }).count(),
    0,
  )
  assert.equal(await dialog.locator('canvas').count(), 1)
  assert.equal(
    await dialog.getByLabel('Electrode 1 · row 1, column 1 (mm)', { exact: true }).inputValue(),
    '2',
  )
  await page.screenshot({
    path: '/tmp/electrode-configurator.png',
  })
  await dialog.getByRole('button', { name: 'Cancel configuration', exact: true }).click()
  await page.locator('button[data-feature="chamber"]').click()
  await page.getByLabel('Bore size examples', { exact: true }).selectOption('19')
  assert.equal((await snapshot()).chambers[0].innerRadius, 9.5)
  const bore = page.getByLabel('Bore / inner diameter (mm)', { exact: true })
  await bore.fill('12')
  await bore.dispatchEvent('change')
  assert.equal((await snapshot()).chambers[0].innerRadius, 6)
  await page.locator('button[data-feature="electrodes"]').click()
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
    await finishSetup(id)
    await dialog.getByRole('button', { name: 'Apply electrode configuration', exact: true }).click()
    const el = (await snapshot()).electrodes[0]
    assert.equal(el.length, values[0], id)
    assert.equal(el.contactCount, values[1], id)
    assert.equal(el.hardware.rows * el.hardware.columns, values[2], id)
    assert.equal(el.hardware.width, values[3], id)
    assert.equal(el.hardware.thickness, values[4], id)
  }
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('np1')
  await dialog.getByLabel('Hardware preset', { exact: true }).selectOption('micro-fma')
  assert.equal(await dialog.locator('canvas').count(), 0)
  await dialog.getByLabel('Hardware preset', { exact: true }).selectOption('custom-array')
  await finishSetup('custom-array')
  await dialog.getByRole('button', { name: 'Change device configuration', exact: true }).click()
  assert.equal(await dialog.locator('canvas').count(), 1)
  await dialog.getByRole('button', { name: 'Cancel configuration', exact: true }).click()
  await page.locator('.electrode-configurator').waitFor({ state: 'detached' })
  console.log('  ok - all hardware families apply actual dimensions through the draft window')
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('micro-lma')
  await finishSetup('micro-lma')
  await dialog.getByText('Connector, material and other order specifications', { exact: true }).click()
  await dialog.getByLabel('Additional rigid tube', { exact: true }).selectOption('Stainless steel')
  await page.waitForFunction(
    () => globalThis.document.activeElement?.closest('[data-followup="tubeLength"]') !== null,
  )
  await dialog.getByRole('button', { name: 'Cancel configuration', exact: true }).click()
  await page.locator('.electrode-configurator').waitFor({ state: 'detached' })
  console.log(
    '  ok - individual profiles, slanted patterns and optional tubing reveal and focus their dependent inputs',
  )

  await page.getByLabel('Hardware preset', { exact: true }).selectOption('plexon-u')
  await finishSetup('plexon-u')
  await dialog.getByLabel('Site arrangement', { exact: true }).selectOption('Tetrode')
  await dialog.getByLabel('Fluid capillaries', { exact: true }).selectOption('1')
  assert.deepEqual(
    await dialog.getByLabel('Optic fibers', { exact: true }).locator('option').allTextContents(),
    ['0', '1'],
  )
  await dialog.getByLabel('Fluid capillaries', { exact: true }).selectOption('0')
  assert.deepEqual(
    await dialog.getByLabel('Optic fibers', { exact: true }).locator('option').allTextContents(),
    ['0', '1', '2'],
  )
  await dialog.getByRole('button', { name: 'Apply electrode configuration', exact: true }).click()
  const gridNav = page.locator('button[data-feature="grid"]')
  assert.equal(await gridNav.getAttribute('aria-disabled'), 'false')
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('np2-four')
  await dialog.getByRole('button', { name: 'Apply electrode configuration', exact: true }).click()
  assert.equal(await gridNav.getAttribute('aria-disabled'), 'true')
  await gridNav.hover()
  await page.getByRole('tooltip').filter({ hasText: 'array-specific mount' }).waitFor()
  await gridNav.click({ force: true })
  await page.getByRole('button', { name: 'Configure electrode hardware', exact: true }).waitFor()
  await gridNav.focus()
  await page.getByRole('tooltip').filter({ hasText: 'array-specific mount' }).waitFor()
  console.log(
    '  ok - dependent dropdowns update immediately; array Grid is unavailable with hover and keyboard explanations',
  )
  assert.deepEqual(errors, [])
  console.log(
    '  ok - configuration Cancel is inert; FMA requires variant; numbered length edits commit in one undo; bore edits use diameter',
  )
} finally {
  await browser.close()
}
