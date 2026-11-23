import assert from 'node:assert/strict'
import { createProject, addAssembly } from '../model.ts'
import { validateProject } from '../validation.ts'
import { hardwareFitsBore } from '../hardware.ts'
import { guideTubePath } from '../geometry.ts'
import { clearance, searchTarget } from '../optimization.ts'
const p = createProject(
  { id: 'image', name: 'a.nii', role: 'anatomy', frameId: 'f', sha256: 'a'.repeat(64), sourcePath: null },
  'Tube',
  { kind: 'standalone', subject: null, scan: null, sourceRoot: null },
)
addAssembly(p, [0, 0, 30])
const e = p.electrodes[0],
  c = p.chambers[0],
  g = p.grids[0]
e.guideTube = { innerDiameter: 0.5, outerDiameter: 1, length: 20, tipDepth: 15 }
validateProject(p)
assert.deepEqual(guideTubePath(c, g, e), { start: [0, 0, 35], end: [0, 0, 15] })
assert.equal(hardwareFitsBore(e, [7.8, 0, 0], 8), false)
const tooSmall = structuredClone(p)
tooSmall.electrodes[0].guideTube.innerDiameter = 0.1
assert.throws(() => validateProject(tooSmall), /inner diameter/)
p.avoidRegions = [
  { id: 'avoid', name: 'Tube-only collision', frameId: p.frame.id, center: [0.7, 0, 20], radius: 0.1 },
]
assert.ok(clearance(p, c, g, e) < 0.11, 'Tube radius contributes independently of the narrower shaft')
p.avoidRegions = []
p.planning = { mode: 'existing', seed: null, searchRadius: 10, searchStep: 2, maxMiss: 0.5, margin: 1 }
p.targets = [
  {
    id: 'target',
    name: 'Inside tube',
    point: [0, 0, 20],
    frameId: p.frame.id,
    color: '#ffffff',
    atlas: null,
  },
]
assert.equal(
  searchTarget(p, e.id, 'target').candidates.length,
  0,
  'A target inside the tube is not a feasible exposed tip',
)
p.targets[0].point = [0, 0, 0]
assert.ok(searchTarget(p, e.id, 'target').candidates.length > 0)
console.log(
  '  ok - guide tube dimensions, bore footprint, exclusion radius and exposed-tip search limits use physical coordinates',
)
