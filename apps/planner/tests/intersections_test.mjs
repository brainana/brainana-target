import assert from 'node:assert/strict'
import { findIntersections } from '../src/render/intersections.ts'
import { gridWedge } from '../src/render/gridGeometry.ts'
import { blade, cylinder } from '../src/render/primitives.ts'
import { stereotaxGeometry } from '../src/render/stereotaxGeometry.ts'
import { createProject } from '@brainana/planning-core/model.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'

const origin = [0, 0, 0], angles = [0, 0, 0]
function box(name, center, radius, group = name) {
  return {
    ...blade([center[0], center[1], center[2] - radius], [center[0], center[1], center[2] + radius],
      { origin, angles }, radius * 2, radius * 2, 0),
    group, name,
  }
}
const brain = { ...box('Brain', origin, 8), anatomy: true }
const cross = box('Frame', [7, 1, 0], 3)
assert.deepEqual(findIntersections([brain, cross]).pairs, ['Brain × Frame'])
const crossing = findIntersections([brain, cross])
assert.ok(crossing.points.length > 0)
assert.ok(crossing.overlap.tris.length > 0, 'Sampled hardware regions inside the brain are colored')
const bar = { ...blade([-20, 0, 0], [20, 0, 0], { origin, angles: [0, 90, 0] }, 2, 2, 0), group: 'bar', name: 'Ear bar' }
const skewer = findIntersections([bar, brain])
assert.deepEqual(skewer.pairs, ['Brain × Ear bar'])
assert.ok(skewer.overlap.tris.length > 0)
assert.ok(skewer.overlap.pts.every((value, index) => index % 3 !== 0 || Math.abs(value) < 9.5), 'Hardware outside the brain is left uncolored')
assert.deepEqual(findIntersections([brain, box('Probe', [1, 0, 0], 1)]).pairs, ['Brain × Probe'])
const chamber = { pose: { origin, angles }, innerRadius: 5, wallThickness: 1, height: 8 }
const guide = { count: 3, spacing: 2, rotation: 0, holeDiameter: 1, minimumThickness: 2 }
const grid = { ...gridWedge(chamber, guide), group: 'grid', name: 'Guide grid', gridSolid: { chamber, grid: guide } }
const shaftAt = x => ({ ...cylinder([x, 0, -5], [x, 0, 5], .15), group: 'probe', name: 'Probe', penetration: true })
assert.deepEqual(findIntersections([brain, shaftAt(0)]).pairs, [], 'Intended brain penetration is not a collision')
assert.deepEqual(findIntersections([grid, shaftAt(0)]).pairs, [], 'A shaft in the bore does not hit the grid')
assert.deepEqual(findIntersections([grid, shaftAt(1)]).pairs, ['Guide grid × Probe'], 'A shaft between bores hits grid material')
assert.deepEqual(findIntersections([cross, shaftAt(7)]).pairs, ['Frame × Probe'], 'Shaft overlap with independent hardware is retained')

assert.deepEqual(findIntersections([brain, box('Probe', [10, 12, 0], 1)]).pairs, [])
assert.deepEqual(findIntersections([brain, { ...cross, anatomy: true }]).pairs, [])
assert.deepEqual(findIntersections([box('Chamber', origin, 8, 'chamber'), { ...cross, group: 'chamber' }]).pairs, [])

const asset = { id: 'a', name: 'reference.nii.gz', role: 'anatomy', frameId: 'frame', sourcePath: null, sha256: 'a'.repeat(64) }
const project = createProject(asset, 'Custom frame', {kind:'standalone',subject:null,scan:null,sourceRoot:null})
const rig = {
  preset: 'custom', pose: { origin, angles }, railDropMm: 0, earTipSpacingMm: 20, arms: [],
  dimensions: { lengthMm: 100, spacingMm: 60, widthMm: 5, posteriorMm: 20, earBarWidthMm: 4 },
}
project.stereotax = rig
assert.deepEqual(validateProject(project).stereotax, rig)
const { pts } = stereotaxGeometry(rig)
const y = Array.from(pts).filter((_, i) => i % 3 === 1)
assert.equal(Math.min(...y), -20)
assert.equal(Math.max(...y), 80)
assert.throws(() => validateProject({ ...project, stereotax: { ...rig, dimensions: { ...rig.dimensions, widthMm: 65 } } }), /rails overlap/)
console.log('Intersection crossings, containment, exclusions and custom frame validation passed.')
