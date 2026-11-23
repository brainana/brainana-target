import assert from 'node:assert/strict'
import { searchTarget, settings } from '../optimization.ts'
import { createProject, addAssembly } from '../model.ts'
import { validateProject } from '../validation.ts'
import { localSites, shankOffsets, shankLength, gridCompatibility } from '../hardware.ts'
import { hardwareCatalog, applyHardwarePreset } from '../../../apps/planner/src/hardware/catalog.ts'
import {
  configureHardware,
  normalizeLegacyPreset,
  availableChoices,
  families,
  setIndividualLength,
  setUniformLength,
} from '../../../apps/planner/src/hardware/configuration.ts'
import { coordinateRows } from '../../../apps/planner/src/data/export.ts'
const p = createProject(
  { id: 'image', name: 'a.nii', role: 'anatomy', frameId: 'frame', sha256: 'a'.repeat(64), sourcePath: null },
  'Manufacturer options',
  { kind: 'standalone', subject: null, scan: null, sourceRoot: null },
)
addAssembly(p, [0, 0, 30])
const e = p.electrodes[0]
function preset(id) {
  applyHardwarePreset(
    e,
    hardwareCatalog.find((x) => x.id === id),
  )
  validateProject(p)
}
function configure(patch) {
  configureHardware(e, patch)
  validateProject(p)
}
preset('plexon-u')
assert.equal(e.length, 25)
assert.equal(e.hardware.reservedLength, 25)
configure({ fluid: 1 })
assert.equal(e.diameter, 0.21)
assert.equal(e.hardware.tipOffset, 0.36)
configure({ fluid: 2 })
assert.equal(e.diameter, 0.236)
assert.equal(e.hardware.configuration.reinforcementDiameter, 640)
assert.throws(() => configureHardware(structuredClone(e), { reinforcementDiameter: 460 }), /640/)
assert.throws(() => configureHardware(structuredClone(e), { totalLength: 40, reinforcement: 20 }), /25 mm/)
assert.throws(() => configureHardware(structuredClone(e), { optic: 3 }), /at most 4/)
configure({ fluid: 0, layout: 'Stereotrode' })
let sites = localSites(e, 0)
assert.ok(Math.abs(sites[1][0] - sites[0][0] - 0.05) < 1e-10)
assert.equal(sites[0][2], sites[1][2])
configure({ layout: 'Tetrode' })
sites = localSites(e, 0)
assert.ok(Math.abs(sites[2][2] - sites[0][2] - 0.05) < 1e-10)
assert.ok(Math.abs(sites[4][2] - sites[2][2] - 0.1) < 1e-10, 'intergroup gap is measured edge to edge')
assert.throws(() => configureHardware(structuredClone(e), { channels: 64 }), /64-channel tetrode/)
configure({ layout: 'Single', channels: 64, spacing: 75 })
assert.equal(e.contactCount, 64)
assert.throws(() => configureHardware(structuredClone(e), { spacing: 200 }), /Unsupported pitch/)
configure({ face: 'Janus opposite faces' })
assert.ok(localSites(e, 0)[0][1] > 0 && localSites(e, 0)[1][1] < 0)
// Descriptive connector changes preserve measured custom geometry and explicit site maps.
e.diameter = 0.4
const beforeSites = structuredClone(e.hardware.sitePositions)
configure({ connector: 'CON/64f-Samtec' })
assert.equal(e.diameter, 0.4)
assert.deepEqual(e.hardware.sitePositions, beforeSites)
console.log(
  '  ok - Plexon dimensions depend on accessory count, groups and reinforcement; invalid configurations are rejected',
)
preset('micro-fma')
configure({ shafts: '18 / 16', pitch: 250, length: 5, shortLength: 1, lengthProfile: 'Slanted' })
assert.equal(shankOffsets(e).length, 18)
assert.equal(e.hardware.recordingChannels, 16)
assert.equal(e.hardware.pitchX, 0.25)
assert.equal(shankLength(e, 0), 1)
assert.equal(shankLength(e, 5), 5)
configure({ lengthProfile: 'Staggered' })
assert.equal(shankLength(e, 0), 5)
assert.equal(shankLength(e, 1), 1)
assert.equal(shankLength(e, 6), 1)
const custom = [...e.hardware.shankLengths]
custom[0] = 2
e.hardware.shankLengths = custom
e.hardware.configuration.lengthProfile = 'Individual lengths'
e.depth = 2
configure({ material: 'Pure Iridium' })
assert.equal(shankLength(e, 0), 2)
assert.throws(() => configureHardware(structuredClone(e), { length: 11 }), /outside/)
preset('micro-mea')
configure({ rows: 8, columns: 8, length: 40, pitchX: 100, pitchY: 100, tipSize: 6 })
assert.equal(shankOffsets(e).length, 64)
assert.equal(e.length, 40)
assert.equal(e.contactLength, 0.006)
assert.throws(() => configureHardware(structuredClone(e), { columns: 9 }), /4–64/)
preset('micro-lma')
configure({ shafts: 4, sites: 32, siteSize: 12.5, spacing: 75 })
assert.equal(e.contactCount, 32)
assert.equal(e.hardware.recordingChannels, 128)
assert.equal(e.contactSpacing, 0.075)
console.log('  ok - FMA, MEA and LMAv2 apply manufacturer length, pitch, count and individual needle options')
preset('utah')
configure({ layout: '5 × 5', length: 1, shortLength: 0.5, lengthProfile: 'Slanted' })
assert.equal(shankOffsets(e).length, 25)
assert.equal(shankLength(e, 0), 0.5)
assert.equal(shankLength(e, 4), 1)
configure({ cableLength: 130 })
assert.equal(e.length, 1, 'cable length must never become needle reach')
preset('plexon-nform')
assert.equal(shankOffsets(e).length, 4)
assert.equal(e.contactCount, 8)
assert.deepEqual(
  e.hardware.sitePositions.map((p) => p[2]),
  [0, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
)
configure({ rows: 4, columns: 4, length: 15 })
assert.equal(e.hardware.recordingChannels, 128)
assert.equal(e.length, 15)
assert.throws(
  () => configureHardware(structuredClone(e), { firstGap: 1000, spacing: 1000 }),
  /proximal limit/,
)
preset('plexon-thumbtack')
assert.equal(e.length, 3)
assert.equal(e.hardware.tipOffset, 0.45)
assert.throws(() => configure({ channels: 24, spacing: 500 }), /physical shaft/)
preset('np-nhp-short')
assert.equal(e.length, 10)
assert.equal(e.hardware.thickness, 0.122)
assert.equal(e.contactCount, 960)
console.log(
  '  ok - Utah surface lengths, N-Form site rules and NHP variant dimensions are distinct from cable / system counts',
)
preset('custom-linear')
e.contactCount = 3
e.hardware.sitePositions = [
  [0, 0.15, 0.1],
  [0, -0.15, 0.5],
  [0, 0.15, 1.2],
]
validateProject(p)
const regularRows = coordinateRows(p)
assert.ok(regularRows.some((r) => String(r[1]).includes('site 3')))
const valid = structuredClone(p)
e.hardware.sitePositions[2][0] = 1
assert.throws(() => validateProject(p), /outside shaft/)
e.hardware.sitePositions = [[0, 0, 0]]
assert.throws(() => validateProject(p), /match site count/)
assert.deepEqual(
  validateProject(valid).electrodes[0].hardware.sitePositions,
  valid.electrodes[0].hardware.sitePositions,
)
console.log(
  '  ok - explicit custom site coordinates validate and export without regular-spacing substitutions',
)

preset('np2-four')
const physicalBefore = { sites: localSites(e, 0), offsets: shankOffsets(e), length: e.length, depth: e.depth }
configureHardware(e, { acquisition: 'OneBox' })
assert.deepEqual(
  { sites: localSites(e, 0), offsets: shankOffsets(e), length: e.length, depth: e.depth },
  physicalBefore,
)
configureHardware(e, { acquisition: 'PXIe' })
assert.deepEqual(
  { sites: localSites(e, 0), offsets: shankOffsets(e), length: e.length, depth: e.depth },
  physicalBefore,
)
console.log(
  '  ok - acquisition-system changes preserve every physical site, shaft offset, length and insertion depth',
)

preset('plexon-u')
configureHardware(e, { layout: 'Tetrode', fluid: 1 })
const optic = families.plexon.options.find((o) => o.key === 'optic')
assert.deepEqual(availableChoices(e, optic), [0, 1])
const beforeChoices = structuredClone(e)
availableChoices(e, optic)
assert.deepEqual(e, beforeChoices)
configureHardware(e, { fluid: 0 })
assert.deepEqual(availableChoices(e, optic), [0, 1, 2])
assert.equal(gridCompatibility(e).available, true)
for (const id of ['micro-fma', 'utah', 'np2-four', 'plexon-nform', 'custom-array']) {
  preset(id)
  assert.equal(gridCompatibility(e).available, false, id)
}
preset('np2-single')
assert.equal(gridCompatibility(e).available, true)
console.log(
  '  ok - accessory menus expose only the remaining shared allowance without mutation; array grid compatibility is explicit',
)

preset('custom-array')
p.targets = [{ id: 't', name: 't', frameId: p.frame.id, point: [0, 0, 0], color: '#ffffff', atlas: null }]
p.planning = { ...settings(p), mode: 'existing' }
assert.equal(
  searchTarget(p, e.id, 't').tested,
  1,
  'A fixed array must not be moved through a discrete guide-hole search',
)
console.log(
  '  ok - fixed-array searches preserve the assembly reference instead of offering guide-hole relocations',
)

preset('micro-fma')
configure({ length: 0.5, lengthProfile: 'Uniform' })
const profileOption = families.fma.options.find((o) => o.key === 'lengthProfile')
assert.deepEqual(availableChoices(e, profileOption), [
  'Uniform',
  'Slanted',
  'Staggered',
  'Clustered',
  'Individual lengths',
])
configure({ lengthProfile: 'Slanted' })
assert.equal(e.hardware.configuration.shortLength, 0.5)
configure({ length: 3, lengthProfile: 'Uniform' })
setIndividualLength(e, 0, 2)
assert.equal(e.hardware.configuration.lengthProfile, 'Individual lengths')
assert.equal(shankLength(e, 0), 2)
assert.ok(e.hardware.shankLengths.slice(1).every((length) => length === 3))
configure({ material: 'Pure Iridium' })
assert.equal(shankLength(e, 0), 2)
configure({ lengthProfile: 'Uniform' })
assert.ok(shankOffsets(e).every((_, index) => shankLength(e, index) === 3))
console.log(
  '  ok - documented FMA modes remain selectable at the minimum length; editing one electrode preserves all others and switches to Individual',
)

setUniformLength(e, 4)
assert.equal(e.hardware.configuration.length, 4)
assert.equal(e.hardware.configuration.lengthProfile, 'Uniform')
assert.ok(shankOffsets(e).every((_, index) => shankLength(e, index) === 4))
setIndividualLength(e, 1, 2)
assert.equal(e.hardware.configuration.lengthProfile, 'Individual lengths')
assert.equal(shankLength(e, 0), 4)
assert.equal(shankLength(e, 1), 2)
assert.throws(() => setUniformLength(e, 11), /between/)
console.log(
  '  ok - common-length edits synchronize the uniform baseline and obey the selected family length bounds',
)

for (const preset of hardwareCatalog) {
  const device = structuredClone(e)
  applyHardwarePreset(device, preset)
  const { setupOptions, setupReady, setupValues, confirmSetup } =
    await import('../../../apps/planner/src/hardware/setup.ts')
  assert.equal(setupReady(device), setupOptions(device).length === 0, preset.id)
  if (setupOptions(device).length) {
    assert.throws(() => confirmSetup(structuredClone(device), {}), /Choose|must be between/)
    confirmSetup(device, setupValues(device))
    assert.equal(setupReady(device), true, preset.id)
    assert.equal(setupReady(JSON.parse(JSON.stringify(device))), true, preset.id)
    applyHardwarePreset(device, preset)
    assert.equal(setupReady(device), false, `${preset.id}: reset requires configuration`)
  }
}
console.log(
  '  ok - every customizable family requires validated geometry setup; fixed models are ready and reset invalidates confirmation',
)

preset('plexon-u')
configure({ channels: 32 })
const legacyPhysical = {
  sites: localSites(e, 0),
  offsets: shankOffsets(e),
  length: e.length,
  diameter: e.diameter,
  depth: e.depth,
}
e.hardware.presetId = 'plexon-u32'
e.hardware.configuration.setupConfirmed = 'plexon-u32'
normalizeLegacyPreset(e)
assert.equal(e.hardware.presetId, 'plexon-u')
assert.equal(e.hardware.configuration.channels, 32)
assert.equal(e.hardware.configuration.setupConfirmed, 'plexon-u')
assert.deepEqual(
  {
    sites: localSites(e, 0),
    offsets: shankOffsets(e),
    length: e.length,
    diameter: e.diameter,
    depth: e.depth,
  },
  legacyPhysical,
)
console.log(
  '  ok - legacy U-Probe family names normalize without changing manufactured or customized geometry',
)
