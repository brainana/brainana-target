import assert from 'node:assert/strict'
import { createProject, addAssembly } from '../model.ts'
import {
  axes,
  localToWorld,
  worldToLocal,
  trajectory,
  gridHoles,
  closestHole,
  dot,
  trajectoryAxes,
} from '../geometry.ts'
import { validateProject } from '../validation.ts'
import { reslice, trilinear } from '../reslice.ts'
const near = (a, b, t = 1e-8) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`)
const vec = (a, b) => a.forEach((v, i) => near(v, b[i]))
const asset = {
  id: 'image',
  name: 'anatomy.nii.gz',
  role: 'anatomy',
  frameId: 'frame',
  sha256: 'a'.repeat(64),
  sourcePath: null,
}
const p = createProject(asset, 'Test', { kind: 'standalone', subject: null, scan: null, sourceRoot: null })
addAssembly(p, [10, 20, 30])
const [c] = p.chambers,
  [g] = p.grids,
  [e] = p.electrodes
validateProject(p)
vec(trajectory(c, g, e).tip, [10, 20, 0])
vec(trajectory(c, g, e).contacts[0], [10, 20, 0.25])
console.log('  ok - chamber origin, insertion axis and contact depth have known world coordinates')
c.pose.angles = [90, 0, 0]
e.hole = [2, 3]
e.depth = 20
vec(trajectory(c, g, e).entry, [12, 20, 33])
vec(trajectory(c, g, e).tip, [12, 40, 33])
console.log('  ok - 90 degree X tilt moves insertion along positive A and preserves local grid axes')
for (const angle of [
  [13, 27, 42],
  [-70, 89, 130],
  [0, 0, 0],
]) {
  c.pose.angles = angle
  const a = axes(c.pose)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(dot(a[i], a[j]), i === j ? 1 : 0)
  vec(worldToLocal(c.pose, localToWorld(c.pose, [-3, 7, -29])), [-3, 7, -29])
}
console.log('  ok - arbitrary rigid poses are orthonormal and invertible')
c.pose.angles = [0, 0, 0]
g.rotation = 90
e.hole = [2, 0]
e.depth = 30
vec(trajectory(c, g, e).entry, [10, 22, 30])
vec(closestHole(c, g, [10, 22, 0]).hole, [2, 0])
near(closestHole(c, g, [10, 22, 0]).miss, 0)
assert.ok(gridHoles(c, g).every(([x, y]) => Math.hypot(x * g.spacing, y * g.spacing) <= c.innerRadius + 1e-8))
console.log('  ok - grid rotation and bore-limited nearest-hole access agree with known geometry')
for (const change of [
  (d) => {
    d.schemaVersion = 99
  },
  (d) => {
    d.targets.push({
      id: 't',
      name: 'bad',
      point: [NaN, 0, 0],
      frameId: 'frame',
      color: '#ffffff',
      atlas: null,
    })
  },
  (d) => {
    d.electrodes[0].hole = [100, 100]
  },
  (d) => {
    d.electrodes[0].targetId = 'missing'
  },
  (d) => {
    d.electrodes[0].contactLength = 4
  },
  (d) => {
    d.assets[0].frameId = 'another'
  },
  (d) => {
    d.grids[0].count = 4
  },
]) {
  const clone = structuredClone(p)
  change(clone)
  assert.throws(() => validateProject(clone), /Invalid project/)
}
console.log(
  '  ok - malformed values, unsupported versions and broken object/frame relationships are rejected',
)
const [u, v, w] = trajectoryAxes([0, 0, -1])
near(dot(u, w), 0)
near(dot(v, w), 0)
near(dot(u, v), 0)
const volume = (world) => world[0] + 2 * world[1] + 3 * world[2]
const values = reslice(
  { center: [10, 20, 30], right: [1, 0, 0], up: [0, 1, 0], widthMm: 4, heightMm: 4 },
  2,
  2,
  volume,
)
assert.deepEqual([...values], [141, 143, 137, 139])
near(
  trilinear([0.5, 1.2, 0.7], [4, 4, 4], (x, y, z) => x + 2 * y + 3 * z),
  5,
)
assert.ok(Number.isNaN(trilinear([-1, 0, 0], [4, 4, 4], () => 1)))
console.log(
  '  ok - physical reslice positions, interpolation and out-of-volume handling are analytically correct',
)

const { aimPose, fitElectrode, length, sub } = await import('../geometry.ts')
const { fitTarget } = await import('../targeting.ts')
for (const point of [
  [25, -10, 0],
  [10, 20, 60],
  [40, 20, 30],
  [10, 20, 0],
]) {
  for (const rotation of [0, 73, -130]) {
    const pose = aimPose({ origin: [10, 20, 30], angles: [17, -22, rotation] }, point)
    const chamber = { ...c, pose }
    const fitted = fitElectrode(chamber, g, e, point)
    assert.deepEqual(fitted.hole, [0, 0])
    near(fitted.miss, 0)
    vec(trajectory(chamber, g, { ...e, ...fitted }).tip, point)
  }
}
assert.throws(() => aimPose(c.pose, c.pose.origin), /Zero-length/)
assert.throws(() => fitElectrode(c, g, e, [10, 20, 31]), /behind/)
assert.throws(() => fitElectrode(c, g, e, [10, 20, -200]), /electrode length/)
p.targets.push({
  id: 'target',
  name: 'Target',
  point: [21, 9, -5],
  frameId: p.frame.id,
  color: '#ffffff',
  atlas: null,
})
fitTarget(p, e.id, 'target', true)
near(length(sub(trajectory(c, g, e).tip, p.targets[0].point)), 0)
validateProject(p)
const beforeFailure = structuredClone(p)
p.targets[0].point = [...c.pose.origin]
const beforeCommand = structuredClone(p)
assert.throws(() => fitTarget(p, e.id, 'target', true))
assert.deepEqual(p, beforeCommand)
p.targets = beforeFailure.targets
console.log('  ok - target aiming reaches arbitrary RAS directions and failed fits leave hardware unchanged')
