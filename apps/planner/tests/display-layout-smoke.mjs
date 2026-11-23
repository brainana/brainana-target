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
  for (const name of ['Resize view columns', 'Resize view rows'])
    assert.equal(await page.getByRole('separator', { name, exact: true, includeHidden: true }).isVisible(), false)
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
  for (const name of ['Resize view columns', 'Resize view rows'])
    assert.equal(await page.getByRole('separator', { name, exact: true }).isVisible(), true)
  const snapshot = async () => {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save project', exact: true }).click()
    return (await unpackProject(new Uint8Array(await fs.readFile(await (await download).path())))).project
  }

  const before = await snapshot()
  const render = page.getByLabel('Three-dimensional anatomy and chamber', { exact: true })
  const implant = page.getByLabel('Chamber opacity in 3D', { exact: true })
  const brain = page.getByLabel('Brain / skull opacity in 3D', { exact: true })
  const setOpacity = async (field, value) => {
    await field.evaluate((input, value) => {
      input.value = String(value)
      input.dispatchEvent(new globalThis.Event('input', { bubbles: true }))
    }, value)
  }
  const visibleImplant = await render.screenshot()
  await setOpacity(implant, 0)
  assert.equal(await brain.inputValue(), '0.3')
  assert.notDeepEqual(await render.screenshot(), visibleImplant)
  await setOpacity(implant, 0.8)
  const visibleBrain = await render.screenshot()
  await setOpacity(brain, 0)
  assert.equal(await implant.inputValue(), '0.8')
  assert.notDeepEqual(await render.screenshot(), visibleBrain)
  await setOpacity(brain, 0.3)
  const visibility = page.getByRole('button', { name: '3D visibility controls', exact: true })
  await visibility.click()
  for (const label of [
    'chambers',
    'guide grid',
    'electrodes / arrays',
    'recording sites',
    'chamber axes',
    'targets',
    'avoid regions',
  ]) {
    const checkbox = page.getByLabel(`Show ${label} in 3D`, { exact: true })
    if (await checkbox.isDisabled()) {
      assert.ok(['targets', 'avoid regions'].includes(label))
      assert.ok(await checkbox.locator('..').getAttribute('title'))
      continue
    }
    await checkbox.uncheck()
    assert.equal(await checkbox.isChecked(), false)
    await checkbox.check()
  }
  await visibility.press('Escape')
  assert.equal(await visibility.getAttribute('aria-expanded'), 'false')
  const drag = async (label, dx, dy) => {
    const box = await page.getByRole('separator', { name: label, exact: true }).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 })
    await page.mouse.up()
  }
  const sidebar = await page.locator('.inspector').boundingBox()
  await drag('Resize settings panel', 120, 0)
  assert.ok((await page.locator('.inspector').boundingBox()).width > sidebar.width + 100)
  const anatomyBox = await page.locator('.view-pane').nth(0).boundingBox()
  await drag('Resize view columns', 100, 0)
  assert.ok((await page.locator('.view-pane').nth(0).boundingBox()).width > anatomyBox.width + 80)
  const heightBefore = (await page.locator('.view-pane').nth(0).boundingBox()).height
  await drag('Resize view rows', 0, -80)
  assert.ok((await page.locator('.view-pane').nth(0).boundingBox()).height < heightBefore - 60)
  await page.waitForFunction(() => {
    const canvas = globalThis.document.querySelector(
      'canvas[aria-label="Three-dimensional anatomy and chamber"]',
    )
    return Math.abs(canvas.width - canvas.getBoundingClientRect().width * globalThis.devicePixelRatio) < 3
  })
  const column = page.getByRole('separator', { name: 'Resize view columns', exact: true })
  const value = Number(await column.getAttribute('aria-valuenow'))
  await column.focus()
  await column.press('ArrowLeft')
  assert.ok(Number(await column.getAttribute('aria-valuenow')) < value)
  const after = await snapshot()
  for (const key of ['chambers', 'grids', 'electrodes', 'targets', 'avoidRegions', 'display'])
    assert.deepEqual(after[key], before[key], `${key} unchanged by presentation settings`)
  await page.screenshot({
    path: '/tmp/resizable-3d-controls.png',
  })
  const resizedWidth = (await page.locator('.inspector').boundingBox()).width
  await page.reload()
  await page.locator('.startup').waitFor({ state: 'hidden' })
  for (const name of ['Resize view columns', 'Resize view rows'])
    assert.equal(await page.getByRole('separator', { name, exact: true, includeHidden: true }).isVisible(), false)
  assert.equal((await page.locator('.inspector').boundingBox()).width, resizedWidth)
  await page.getByRole('button', { name: 'Reset panel sizes', exact: true }).click()
  assert.equal((await page.locator('.inspector').boundingBox()).width, 310)
  await page.screenshot({ path: '/tmp/welcome-without-dividers.png' })
  assert.deepEqual(errors, [])
  console.log(
    '  ok - independent 3D opacity changes actual rendering; all component visibility controls work',
  )
  console.log(
    '  ok - sidebar and view dividers resize with pointer and keyboard, canvases follow, layout persists and resets',
  )
  console.log(
    '  ok - display and layout controls leave scientific project geometry and constraints unchanged',
  )
} finally {
  await browser.close()
}
