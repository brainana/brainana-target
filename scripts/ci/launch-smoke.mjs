import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'))
const report = JSON.parse(await fs.readFile('artifacts/validation/package.json', 'utf8'))
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'brainana-target-ci-'))
let desktop
try {
  const args = ['--desktop-test-profile', profile]
  if (process.env.CI) args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader')
  desktop = await electron.launch({ executablePath: report.binary, args, timeout: 90000 })
  const page = await desktop.firstWindow()
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const identity = await desktop.evaluate(({ app }) => ({ version: app.getVersion(), name: app.getName(), packaged: app.isPackaged, arch: process.arch }))
  assert.deepEqual(identity, { version: pkg.version, name: 'BrainanaTarget', packaged: true, arch: process.arch })
  await expect(page.getByRole('button', { name: 'Try the macaque demo', exact: true })).toBeEnabled()
  assert.equal(await page.evaluate(() => typeof globalThis.require), 'undefined')
  await page.getByRole('link', { name: 'Evaluate placement', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open saved plan…', exact: true })).toBeEnabled()
  await page.getByRole('link', { name: '← Home', exact: true }).click()
  await page.getByRole('button', { name: 'Try the macaque demo', exact: true }).click()
  await page.locator('.welcome').waitFor({ state: 'hidden', timeout: 120000 })
  await expect(page.locator('.workspace')).toBeVisible()
  const anatomy = page.getByLabel('Anatomical image', { exact: true })
  await expect(anatomy.getByRole('option', { name: 'CT · MEBRAINS CT estimate (warped to NMT2Sym).nii.gz', exact: true })).toHaveCount(1)
  const canvas = page.getByLabel('Three-dimensional anatomy and chamber', { exact: true })
  await expect(canvas).toBeVisible()
  const webgl = await canvas.evaluate(el => {
    const gl = el.getContext('webgl2')
    return !!gl && !gl.isContextLost()
  })
  assert.ok(webgl, 'The 3D viewer must have a live WebGL2 context')
  await page.screenshot({ path: 'artifacts/validation/demo.png' })
  const origin = new URL(page.url()).origin
  const runtime = await (await fetch(origin + '/api/version')).json()
  assert.equal(runtime.version, pkg.version)
  assert.deepEqual(errors, [])
  await page.getByText('Autosaved locally', { exact: true }).waitFor({ timeout: 60000 })
  const closing = desktop.close()
  const timeout = setTimeout(() => desktop?.process().kill('SIGKILL'), 15000)
  try { await closing } finally { clearTimeout(timeout) }
  desktop = null
  await assert.rejects(fetch(origin + '/api/health'))
  await fs.writeFile('artifacts/validation/launch.json', JSON.stringify({ identity, checksPassed: true,
    home: true, evaluation: true, bundledNMTAndCT: true, webgl2: true, rendererErrors: errors, serverShutdown: true,
    softwareRendering: !!process.env.CI }, null, 2) + '\n')
  console.log('Packaged startup, evaluation navigation, NMT/CT loading, WebGL2, renderer isolation and server shutdown passed.')
} finally {
  if (desktop) {
    const child = desktop.process(), timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    try { await desktop.close() } finally { clearTimeout(timer) }
  }
  await fs.rm(profile, { recursive: true, force: true })
}
