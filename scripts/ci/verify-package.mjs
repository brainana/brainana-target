import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { listPackage, extractFile } from '@electron/asar'
const release = path.resolve('apps/planner/release')
const candidates = process.platform === 'darwin'
  ? ['mac-arm64/BrainanaTarget.app/Contents', 'mac/BrainanaTarget.app/Contents']
  : process.platform === 'win32' ? ['win-unpacked'] : ['linux-unpacked']
let bundle
for (const candidate of candidates) {
  const dir = path.join(release, candidate)
  try { await fs.access(dir); bundle = dir; break } catch {}
}
assert.ok(bundle, 'Native unpacked app must exist')
const resources = path.join(bundle, process.platform === 'darwin' ? 'Resources' : 'resources')
const archive = path.join(resources, 'app.asar')
const pkg = JSON.parse(extractFile(archive, 'package.json').toString())
const expected = JSON.parse(await fs.readFile('package.json', 'utf8'))
assert.equal(pkg.name, expected.name)
assert.equal(pkg.version, expected.version)
assert.equal(pkg.main, 'apps/planner/desktop.mjs')
const entries = listPackage(archive).map(name => name.replaceAll('\\', '/'))
for (const file of ['apps/planner/desktop.mjs', 'apps/planner/dist/index.html', 'node_modules/@brainana/core-server/main.mjs']) {
  assert.ok(entries.some(entry => entry.endsWith('/' + file)), `Missing packaged file ${file}`)
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const ct = 'demo_viewer/nmt2sym/tpl-NMT2Sym_res-05_desc-MEBRAINS_CT.nii.gz'
const packagedCT = await fs.readFile(path.join(resources, ct))
assert.equal(hash(packagedCT), hash(await fs.readFile(path.join('datasets', ct))), 'Bundled CT must match source')
assert.equal(hash(await fs.readFile(path.join(resources, 'icon.png'))), hash(await fs.readFile('apps/planner/build/icon.png')))
const binary = process.platform === 'darwin' ? path.join(bundle, 'MacOS/BrainanaTarget')
  : path.join(bundle, process.platform === 'win32' ? 'BrainanaTarget.exe' : 'brainana-target')
await fs.access(binary)
const report = { version: pkg.version, platform: process.platform, arch: process.arch, packagedFiles: entries.length,
  ctSHA256: hash(packagedCT), ctBytes: packagedCT.length, iconVerified: true, binary, checksPassed: true }
await fs.mkdir('artifacts/validation', { recursive: true })
await fs.writeFile('artifacts/validation/package.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
