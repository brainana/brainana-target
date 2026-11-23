import assert from 'node:assert/strict'
import { addAssembly, createProject } from '@brainana/planning-core/model.ts'
import { axes, gridFitsChamber, length, sub, trajectory } from '@brainana/planning-core/geometry.ts'
import { maximumSeatedTilt, refitChamberAt, refitChamberTrajectories } from '@brainana/planning-core/placement-adjustment.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
import { anatomyCenter, stereotaxGeometryParts } from '../src/render/stereotaxGeometry.ts'

const asset = { id: 'a', name: 'reference.nii.gz', role: 'anatomy', frameId: 'frame', sourcePath: null, sha256: 'a'.repeat(64) }
const p = createProject(asset, 'Adjustments', { kind: 'standalone', subject: null, scan: null, sourceRoot: null })
p.species = 'tree-shrew'
addAssembly(p, [0, 0, 13])
p.planning = { mode: 'new', seed: null, searchStep: 2, searchRadius: 10, maxMiss: .1, margin: 0 }
const [c] = p.chambers, [g] = p.grids, [e] = p.electrodes
Object.assign(c, { innerRadius: 5, height: 12 })
Object.assign(g, { enabled: true, minimumThickness: 2, tiltAngle: 8, holeDiameter: 1 })
const expected = { ...e, hole: [1, 0], depth: 24 }
p.targets = [{ id: 'target', name: 'Focus', frameId: p.frame.id, color: '#ffffff', atlas: null, point: trajectory(c, g, expected).tip }]
e.targetId = 'target'
assert.equal(refitChamberTrajectories(p, c.id), 1)
assert.deepEqual(e.hole, expected.hole)
assert.ok(Math.abs(e.depth - expected.depth) < 1e-7)
const previous = structuredClone(e)
assert.ok(Math.abs(maximumSeatedTilt(c, g) - 45) < 1e-8)
assert.ok(gridFitsChamber(c, { ...g, tiltAngle: maximumSeatedTilt(c, g) }))
g.tiltAngle = 0
assert.throws(() => refitChamberTrajectories(p, c.id), /No usable guide path/)
assert.deepEqual(e, previous, 'Failed adjustment does not assign an electrode')
g.tiltAngle = 80
assert.throws(() => refitChamberTrajectories(p, c.id), /shortest wall/)
g.tiltAngle = 8
e.depth = 25
assert.throws(() => refitChamberTrajectories(p, c.id, e.id), /No usable guide path/)
e.depth = expected.depth
p.electrodes.push({ ...e, id: 'same-target', name: 'Second device' })
assert.throws(() => refitChamberTrajectories(p, c.id), /share a guide hole or collide/)
p.electrodes.pop()

const mesh = { pts: new Float32Array([-30,-30,0, 30,-30,0, 30,30,0, -30,30,0]), tris: new Uint32Array([0,1,2,0,2,3]), outerEnvelope: true }
const surface = { source: 'skull', assetIds: ['skull'], surfaces: [mesh] }
const initial = structuredClone(p)
const moved = refitChamberAt(p, c.id, [6, 2, 0], [0, 0, 1], surface)
const next = moved.chambers[0]
assert.ok(length(sub(next.pose.origin, c.pose.origin)) > 2)
assert.notDeepEqual(next.pose.angles, c.pose.angles)
assert.deepEqual(moved.grids, p.grids)
assert.deepEqual(next.baseFit.assetIds, ['skull'])
assert.ok(length(sub(trajectory(next, g, moved.electrodes[0]).tip, p.targets[0].point)) < p.planning.maxMiss)
const normal = axes(next.pose)[2]
const actualCenter = next.pose.origin.map((v, i) => v - normal[i] * next.pose.origin[2] / normal[2])
assert.ok(length(sub(actualCenter, [6, 2, 0])) < .5)
assert.deepEqual(p, initial, 'A refit proposes a placement without modifying the saved project')
assert.throws(() => refitChamberAt({ ...p, planning: { ...p.planning, mode: 'existing' } }, c.id, [6, 2, 0], [0, 0, 1], surface), /fixed measured pose/)

assert.deepEqual(anatomyCenter([{ extentsMin: [-7, 0, 3], extentsMax: [9, 20, 17] }], [[-50,-50,-50],[50,50,50]]), [1,10,10])
assert.deepEqual(anatomyCenter([], [[2,4,6],[4,8,10]]), [3,6,8])
const rig = {
  preset: 'kopf-1430', pose: { origin: [1, 10, 10], angles: [0, 0, 0] }, railDropMm: 5,
  earTipSpacingMm: 30, earBarId: '853', arms: [],
  biteBar: { adaptorId: '1245', lateralMm: 0, apMm: 15, heightMm: -10, lengthMm: 22, widthMm: 4, thicknessMm: 2 },
}
p.stereotax = rig
assert.equal(validateProject(p).species, 'tree-shrew')
assert.deepEqual(validateProject(p).stereotax, rig)
assert.throws(() => validateProject({ ...p, stereotax: { ...rig, earBarId: '957' } }), /do not match/)
const parts = stereotaxGeometryParts(rig)
assert.deepEqual(parts.map(part => part.kind), ['frame','ears','bite','scales','controls'])
assert.deepEqual(stereotaxGeometryParts({...rig,showDetails:false}).map(part=>part.kind),['frame','ears','bite'])
assert.notDeepEqual(parts[1].geometry.pts, stereotaxGeometryParts({ ...rig, earBarId: '851' })[1].geometry.pts)
const rodent = { ...rig, preset: 'kopf-930', earBarId: '957', railLateralMm: 20, earSupportSpanMm: 50, biteBar: { ...rig.biteBar, adaptorId: '920' } }
assert.deepEqual(validateProject({ ...p, stereotax: rodent }).stereotax, rodent)
assert.deepEqual(stereotaxGeometryParts(rodent).map(part => part.kind), ['frame','ears','bite','scales','controls'])
console.log('Placement adjustment, anatomy centering, species metadata and Kopf accessory geometry passed.')
