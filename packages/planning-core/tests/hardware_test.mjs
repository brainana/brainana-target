import assert from 'node:assert/strict'
import { createProject, addAssembly } from '../model.ts'
import { validateProject } from '../validation.ts'
import { electrodePaths, trajectory, localToWorld, fitElectrode, sub, length } from '../geometry.ts'
import { clearance, searchTarget, applyCandidate } from '../optimization.ts'
import { shankOffsets, shankDepth, maximumInsertion, minimumInsertion, shaftDiameter } from '../hardware.ts'
import { hardwareCatalog, applyHardwarePreset } from '../../../apps/planner/src/hardware/catalog.ts'
import { coordinateRows } from '../../../apps/planner/src/data/export.ts'
import { createAsset } from '../../../apps/planner/src/data/assets.ts'
import { packProject, unpackProject } from '../../../apps/planner/src/data/archive.ts'
const asset = {
  id: 'image',
  name: 'a.nii',
  role: 'anatomy',
  frameId: 'frame',
  sha256: 'a'.repeat(64),
  sourcePath: null,
}
const p = createProject(asset, 'Hardware', {
  kind: 'standalone',
  subject: null,
  scan: null,
  sourceRoot: null,
})
addAssembly(p, [0, 0, 30])
const e = p.electrodes[0],
  c = p.chambers[0],
  g = p.grids[0]
for (const preset of hardwareCatalog) {
  applyHardwarePreset(e, preset)
  validateProject(p)
}
console.log('  ok - all sourced hardware templates validate, including 6144-site probe and 100-shaft array')
applyHardwarePreset(
  e,
  hardwareCatalog.find((x) => x.id === 'custom-array'),
)
e.hardware.rows = 1
e.hardware.columns = 3
e.hardware.pitchX = 2
e.hardware.selectedShank = 2
e.depth = 15
e.hardware.shankLengths = [10, 15, 20]
e.contactCount = 2
e.contactSpacing = 1
assert.deepEqual(shankOffsets(e), [
  [-2, 0, 0],
  [0, 0, 0],
  [2, 0, 0],
])
assert.deepEqual(
  [0, 1, 2].map((i) => shankDepth(e, i)),
  [5, 10, 15],
)
assert.equal(maximumInsertion(e), 20)
assert.equal(minimumInsertion(e), 10)
c.pose.angles = [90, 0, 0]
assert.deepEqual(
  trajectory(c, g, e).tip.map((x) => Math.round(x)),
  [2, 15, 30],
)
const before = electrodePaths(c, g, e)
e.hardware.rotation = 90
assert.ok(length(sub(electrodePaths(c, g, e)[2].entry, localToWorld(c.pose, [0, 2, 0]))) < 1e-8)
assert.notDeepEqual(before[2].entry, electrodePaths(c, g, e)[2].entry)
console.log(
  '  ok - array rotation, individual shaft lengths and selected tip use physical chamber coordinates',
)
c.pose.angles = [0, 0, 0]
e.hardware.rotation = 0
p.avoidRegions = [
  { id: 'avoid', name: 'Neighbour obstacle', frameId: 'frame', center: [-2, 0, 27], radius: 0.5 },
]
assert.ok(clearance(p, c, g, e) < 0, 'non-targeting shaft must block candidate')
p.targets = [{ id: 'target', name: 'T', point: [2, 0, 15], frameId: 'frame', color: '#ff0000', atlas: null }]
p.planning = { mode: 'existing', seed: null, searchRadius: 0, searchStep: 2, maxMiss: 0, margin: 0 }
assert.equal(searchTarget(p, e.id, 'target').candidates.length, 0)
p.avoidRegions = []
const fit = fitElectrode(c, g, e, p.targets[0].point)
assert.deepEqual(fit.hole, [0, 0])
assert.equal(fit.depth, 15)
assert.equal(fit.miss, 0)
const result = searchTarget(p, e.id, 'target')
assert.ok(result.candidates.length)
applyCandidate(p, e.id, 'target', result.candidates[0])
assert.ok(length(sub(trajectory(c, g, e).tip, p.targets[0].point)) < 1e-8)
console.log(
  '  ok - fixed chamber fit targets selected shaft and rejects an obstacle crossing a different shaft',
)
p.planning.mode = 'new'
p.planning.seed = [0, 0, 30]
const surface = new Float32Array([-5, -5, 20, 5, -5, 20, 5, 5, 20, -5, 5, 20])
const full = searchTarget(p, e.id, 'target', { surface, expand: true })
assert.ok(full.candidates.length)
const candidate = full.candidates[0]
applyCandidate(p, e.id, 'target', candidate, { surface, expand: true })
assert.ok(length(sub(trajectory(c, g, e).tip, p.targets[0].point)) < 1e-8)
console.log(
  '  ok - exterior search translates array centre so the selected shaft, rather than empty space between shafts, reaches target',
)
const rows = coordinateRows(p)
assert.equal(rows.filter((r) => r[0] === 'shaft_tip').length, 3)
assert.equal(rows.filter((r) => r[0] === 'contact').length, 6)
const invalid = structuredClone(p)
invalid.electrodes[0].hardware.selectedShank = 99
assert.throws(() => validateProject(invalid))
invalid.electrodes[0].hardware.selectedShank = 0
invalid.electrodes[0].hardware.shankLengths = [1]
assert.throws(() => validateProject(invalid))
applyHardwarePreset(
  e,
  hardwareCatalog.find((x) => x.id === 'np-hd'),
)
e.depth = 2
e.hardware.reservedLength = 0.5
e.length = 9.5
assert.equal(maximumInsertion(e), 9.5)
validateProject(p) // proximal physical sites may be outside the inserted segment
assert.ok(shaftDiameter(e) > e.hardware.width)
const bytes = new Uint8Array([1, 2, 3])
const realAsset = await createAsset('a.nii', 'anatomy', 'frame', bytes)
realAsset.id = 'image'
p.assets = [realAsset]
const reopened = await unpackProject(await packProject(p, new Map([['image', bytes]])))
assert.deepEqual(reopened.project.electrodes[0], e)
// Archive byte integrity is tested separately; the full domain definition must remain lossless.
assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).electrodes[0].hardware, e.hardware)

console.log(
  '  ok - dense sites, conservative blade radius, per-shaft coordinate exports and saved hardware definitions',
)

// Custom physical shafts can exceed the former 150 mm ceiling throughout editing and persistence.
const longProbe = structuredClone(p)
const longElectrode = longProbe.electrodes[0]
applyHardwarePreset(longElectrode, hardwareCatalog.find((preset) => preset.id === 'custom-linear'))
const { confirmSetup, setupValues } = await import('../../../apps/planner/src/hardware/setup.ts')
const { setUniformLength, setIndividualLength } = await import('../../../apps/planner/src/hardware/configuration.ts')
confirmSetup(longElectrode, { ...setupValues(longElectrode), length: 300 })
setUniformLength(longElectrode, 350)
setIndividualLength(longElectrode, 0, 320)
longElectrode.depth = 200
assert.equal(maximumInsertion(longElectrode), 320)
validateProject(longProbe)
const longRoundTrip = await unpackProject(await packProject(longProbe, new Map([['image', bytes]])))
assert.equal(maximumInsertion(longRoundTrip.project.electrodes[0]), 320)
console.log('  ok - custom shafts over 150 mm configure, insert, validate and round-trip')
