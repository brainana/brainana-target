import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import asar from '@electron/asar'
import { chromium } from '@playwright/test'
const resources = path.resolve('apps/planner/release/mac-arm64/BrainanaTarget.app/Contents/Resources')
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'target-payload-'))
let boot, browser
try {
  asar.extractAll(path.join(resources, 'app.asar'), temporary)
  const metadata = JSON.parse(await fs.readFile(path.join(temporary, 'package.json')))
  assert.equal(metadata.name, 'brainana-target')
  assert.equal(metadata.main, 'apps/planner/desktop.mjs')
  const { bootServer } = await import(pathToFileURL(path.join(temporary, 'node_modules/@brainana/core-launcher/launch.mjs')))
  const { viewerManifestProvider } = await import(pathToFileURL(path.join(temporary, 'node_modules/@brainana/brainana-data/manifest.mjs')))
  boot = await bootServer({ manifestProvider: viewerManifestProvider, appLabel: 'BrainanaTarget payload', cacheRoot: path.join(temporary, 'cache'), distRoot: path.join(temporary, 'apps/planner/dist'), preferredPort: 0, appVersion: { version: metadata.version, buildId: 'target-desktop-1' }, runtimeMetadata: { demoDatasetRoot: path.join(resources, 'demo_viewer') } })
  browser = await chromium.launch({ headless: true, args: ['--single-process', '--in-process-gpu', '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(boot.url)
  await page.getByRole('button', { name: 'Try the macaque demo', exact: true }).click()
  await page.locator('.welcome').waitFor({ state: 'hidden', timeout: 60000 })
  await page.getByText('Autosaved locally', { exact: true }).waitFor({ timeout: 30000 })
  await page.locator('button[data-feature="targets"]').click()
  await page.getByRole('button', { name: 'Add target at crosshair' }).click()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  await (await event).saveAs(path.join(temporary, 'test.brainana-plan'))
  assert.ok((await fs.stat(path.join(temporary, 'test.brainana-plan'))).size > 1000000)
  assert.deepEqual(errors, [])
  console.log('Packaged payload passed: shipped dependencies, demo, WebGL rendering, target creation and project export.')
} finally {
  await browser?.close()
  if (boot) await new Promise(resolve => boot.server.close(resolve))
  await fs.rm(temporary, { recursive: true, force: true })
}
