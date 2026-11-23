import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { unpackProject } from '../src/data/archive.ts'
import { chromium } from '@playwright/test'
const projectPath = process.env.PLANNER_DEBUG_PROJECT
if (!projectPath) throw new Error('Set PLANNER_DEBUG_PROJECT to a saved project to reproduce.')
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
let page
try {
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  page.setDefaultTimeout(120000)
  await page.addInitScript(() => {
    globalThis.__uploads = 0
    globalThis.__measure = false
    const original = globalThis.WebGL2RenderingContext.prototype.bufferData
    globalThis.WebGL2RenderingContext.prototype.bufferData = function (...args) {
      if (globalThis.__measure) globalThis.__uploads++
      return original.apply(this, args)
    }
  })
  await page.goto('http://127.0.0.1:5183')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await (await chooser).setFiles(projectPath)
  await page.locator('.welcome').waitFor({ state: 'hidden' })
  await page.locator('button[data-feature="positioning"]').click()
  const originalProject = (await unpackProject(new Uint8Array(await fs.readFile(projectPath)))).project
  const anatomyCanvas = page.getByLabel('Three-dimensional anatomy and chamber', { exact: true })
  const beforeSearch = await anatomyCanvas.screenshot()
  await page.getByRole('tab', { name: 'B · Automatic', exact: true }).click()
  await page.getByRole('button', { name: 'Compute placement candidates', exact: true }).click()
  await page.locator('.placement-preview').waitFor({ state: 'visible' })
  await page.waitForTimeout(150)
  assert.notDeepEqual(await anatomyCanvas.screenshot(), beforeSearch)
  const savePreviewEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  const previewDownload = await savePreviewEvent
  const exportedPreview = await unpackProject(new Uint8Array(await fs.readFile(await previewDownload.path())))
  assert.deepEqual(exportedPreview.project.chambers[0].pose, originalProject.chambers[0].pose)
  await page.getByRole('button', { name: 'Cancel preview', exact: true }).click()
  assert.equal(await page.locator('.placement-preview').isVisible(), false)
  await page.getByRole('button', { name: 'Compute placement candidates', exact: true }).click()
  await page.locator('.placement-preview').waitFor({ state: 'visible' })

  await page.locator('.placement-preview').getByRole('button', { name: 'Place chamber here', exact: true }).waitFor()
  assert.match(
    await page.locator('.feature-panel').innerText(),
    /candidates tested · [1-9][0-9]* meet constraints/,
  )
  await page.locator('.placement-preview').getByRole('button', { name: 'Place chamber here', exact: true }).click()
  assert.equal(await page.locator('.placement-preview').isVisible(), false)
  assert.match(
    await page.locator('.readout').filter({ hasText: 'Current shaft clearance' }).innerText(),
    /meets margin/,
  )
  assert.equal(
    await page.locator('.readout').filter({ hasText: 'Tip-to-target error' }).locator('strong').innerText(),
    '0.00 mm',
  )
  console.log(
    'ok - user example project has feasible exterior chamber candidates and applies an exact target fit',
  )
  await page.locator('button[data-feature="electrodes"]').click()
  await page.getByLabel('Hardware preset', { exact: true }).selectOption('micro-fma')
  const configurator = page.getByRole('dialog', { name: 'Configure electrode hardware' })
  await configurator.getByLabel('Confirm FMA electrode variant', { exact: true }).selectOption('18 / 16')
  await configurator.locator('[data-setup-key="pitch"] select').selectOption('400')
  await configurator.locator('[data-setup-key="lengthProfile"] select').selectOption('Uniform')
  await configurator.getByRole('button', { name: 'Use these device specifications', exact: true }).click()
  await configurator.getByRole('button', { name: 'Apply electrode configuration', exact: true }).click()
  await page.locator('button[data-feature="positioning"]').click()
  await page.getByText(/less than the .*chamber height plus 1 mm/).waitFor()
  await page.getByRole('button', { name: 'Compute placement candidates', exact: true }).click()
  await page.getByRole('heading',{name:/Not enough usable electrode length/}).waitFor()
  await page.getByText(/The shortfall is/).waitFor()
  assert.equal(await page.locator('.placement-preview').isVisible(), false)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  console.log(
    'ok - example monkey with short FMA reports numerical reach deficit and specific remedies; Undo restores the feasible electrode',
  )
  await page.locator('button[data-feature="avoidance"]').click()
  await page.getByRole('button', { name: 'Draw avoidance regions', exact: true }).click()
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    globalThis.__uploads = 0
    globalThis.__measure = true
  })
  const box = await page.getByLabel('Image along electrode trajectory', { exact: true }).boundingBox()
  const start = Date.now()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 12 })
  await page.mouse.up()
  await page.getByRole('heading', { name: 'Drawn region 11', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => globalThis.__uploads), 0)
  console.log(`ok - stroke commits in ${Date.now() - start} ms with zero WebGL buffer uploads`)
  await page.evaluate(() => {
    globalThis.__measure = false
  })
  await page.getByRole('button', { name: 'Update avoidance surfaces', exact: true }).click()
  await page.getByRole('button', { name: 'Finish drawing regions', exact: true }).click()
  await page.screenshot({
    path: new URL('../../../../planner-debug-preview.png', import.meta.url).pathname,
    fullPage: true,
  })
  console.log('ok - explicit surface update and finishing the drawing batch complete')
} catch (error) {
  if (page && !page.isClosed()) console.log((await page.locator('body').innerText()).slice(-2500))
  throw error
} finally {
  await browser.close()
}
