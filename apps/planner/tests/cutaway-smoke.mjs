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

  await page.locator('button[data-feature="targets"]').click()
  await page.getByRole('button', { name: 'Add target at crosshair', exact: true }).click()
  const before = await snapshot()
  const cutToggle = page.getByRole('button', { name: '3D cutaway controls', exact: true })
  const render = page.getByLabel('Three-dimensional anatomy and chamber', { exact: true })
  const plane = page.getByLabel('Cut plane', { exact: true })
  const coordinate = page.getByLabel('3D cut coordinate (mm RAS)', { exact: true })
  const section = page.getByLabel('Show MRI section in 3D', { exact: true })
  const hardware = page.getByLabel('Also cut implant hardware', { exact: true })
  const capture = async () => {
    const openMenus = []
    for (const label of ['3D cutaway controls', '3D visibility controls']) {
      const menu = page.getByRole('button', { name: label, exact: true })
      if ((await menu.getAttribute('aria-expanded')) === 'true') {
        openMenus.push(menu)
        await menu.click()
      }
    }
    const image = await render.screenshot()
    for (const menu of openMenus) await menu.click()
    return image
  }
  const full = await capture()
  await cutToggle.click()
  assert.equal(await coordinate.isDisabled(), true)
  for (const axis of ['0', '1', '2']) {
    console.log(`Checking cardinal axis ${axis}`)
    await plane.selectOption(axis)
    await page.getByRole('button', { name: 'Cut at target', exact: true }).click()
    assert.ok(Math.abs(Number(await coordinate.inputValue()) - before.targets[0].point[Number(axis)]) < 1e-5)
    await page.getByRole('button', { name: 'Cut at electrode tip', exact: true }).click()
    assert.ok(Math.abs(Number(await coordinate.inputValue()) - before.targets[0].point[Number(axis)]) < 1e-5)
    const withSection = await capture()
    assert.notDeepEqual(withSection, full)
    await section.uncheck()
    assert.notDeepEqual(await capture(), withSection)
    await section.check()
    const sectionOpacity = page.getByLabel('MRI section opacity in 3D', { exact: true })
    await sectionOpacity.evaluate((input) => {
      input.value = '0.2'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    assert.notDeepEqual(await capture(), withSection)
    await sectionOpacity.evaluate((input) => {
      input.value = '0.9'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const position = Number(await coordinate.inputValue())
    await coordinate.fill(String(position + (axis === '2' ? 3 : -3)))
    await coordinate.dispatchEvent('change')
    assert.notDeepEqual(await capture(), withSection)
    await page.getByLabel('Keep side of cut', { exact: true }).selectOption('higher')
    assert.equal(await section.isChecked(), true)
    // Isolate hardware so an opaque MRI section cannot conceal the clipped shaft.
    const anatomyOpacity = page.getByLabel('Brain / skull opacity in 3D', { exact: true })
    const opacityBefore = await anatomyOpacity.inputValue()
    await anatomyOpacity.evaluate((input) => {
      input.value = '0'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await section.uncheck()
    const uncutHardware = await capture()
    await hardware.check()
    assert.notDeepEqual(await capture(), uncutHardware)
    await hardware.uncheck()
    await anatomyOpacity.evaluate((input, value) => {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, opacityBefore)
    await section.check()
    await page.getByRole('button', { name: 'Cut at crosshair', exact: true }).click()
    await page.getByLabel('Keep side of cut', { exact: true }).selectOption('lower')
  }
  await page.screenshot({ path: '/tmp/cardinal-cutaway.png' })
  await plane.selectOption('')
  assert.equal(await coordinate.isDisabled(), true)
  assert.deepEqual(await capture(), full, 'Off restores the full scene exactly')
  await cutToggle.press('Escape')
  const layers = page.getByRole('button', { name: '3D visibility controls', exact: true })
  await layers.click()
  const targets = page.getByLabel('Show targets in 3D', { exact: true })
  assert.equal(await targets.isEnabled(), true)
  const withTarget = await capture()
  await targets.uncheck()
  assert.notDeepEqual(await capture(), withTarget)
  await targets.check()
  const enhance = page.getByLabel('Enhance thin electrodes in 3D', { exact: true })
  await enhance.uncheck()
  await enhance.check()
  const after = await snapshot()
  for (const key of ['chambers', 'grids', 'electrodes', 'targets', 'avoidRegions', 'display'])
    assert.deepEqual(after[key], before[key], `${key} unchanged by cutaways and display enhancement`)
  // Isolate the loaded-surface shader from volume rendering and MRI-plane geometry.
  await layers.press('Escape')
  await page.locator('button[data-feature="chamber"]').click()
  const center = before.targets[0].point
  const vertices = Array.from({ length: 8 }, (_, i) =>
    center.map((v, axis) => v + ((i >> axis) & 1 ? 12 : -12)).join(' '),
  )
  const faces = [
    [0, 2, 1],
    [1, 2, 3],
    [4, 5, 6],
    [5, 7, 6],
    [0, 1, 4],
    [1, 5, 4],
    [2, 6, 3],
    [3, 6, 7],
    [0, 4, 2],
    [2, 4, 6],
    [1, 3, 5],
    [3, 7, 5],
  ]
  const ply = [
    'ply',
    'format ascii 1.0',
    'element vertex 8',
    'property float x',
    'property float y',
    'property float z',
    'element face 12',
    'property list uchar int vertex_indices',
    'end_header',
    ...vertices,
    ...faces.map((f) => '3 ' + f.join(' ')),
  ].join('\n')
  const surfaceChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Load aligned skull surface…', exact: true }).click()
  await (
    await surfaceChooser
  ).setFiles({ name: 'skull.ply', mimeType: 'application/octet-stream', buffer: Buffer.from(ply) })
  await page.waitForTimeout(500)
  const surfaceFull = await capture()
  await cutToggle.click()
  await plane.selectOption('0')
  await section.uncheck()
  for (const axis of ['0', '1', '2']) {
    await plane.selectOption(axis)
    await page.getByRole('button', { name: 'Cut at target', exact: true }).click()
    await page.getByLabel('Keep side of cut', { exact: true }).selectOption('lower')
    const lower = await capture()
    assert.notDeepEqual(lower, surfaceFull, 'Loaded surface is clipped')
    await page.getByLabel('Keep side of cut', { exact: true }).selectOption('higher')
    assert.notDeepEqual(await capture(), lower, 'Surface retained side reverses')
  }
  await plane.selectOption('')
  assert.deepEqual(await capture(), surfaceFull, 'Off restores the loaded surface exactly')
  console.log(
    '  ok - imported skull surface meshes clip and reverse consistently in all three cardinal planes',
  )
  assert.deepEqual(errors, [])
  console.log(
    '  ok - sagittal, coronal and axial cutaways display actual MRI sections; positions, targets, side reversal and hardware clipping work',
  )
  console.log(
    '  ok - Off restores the full scene; target visibility and display enhancement preserve scientific geometry',
  )
} finally {
  await browser.close()
}
