import assert from 'node:assert/strict'
import { fitChamberBase, raySurfaceDistance, alignChamberToSurface } from '../surface-fit.ts'
import { localToWorld, axes } from '../geometry.ts'
import { ring } from '../../../apps/planner/src/render/primitives.ts'
const pts = [],
  tris = [],
  side = 41
for (let y = -20; y <= 20; y++) for (let x = -20; x <= 20; x++) pts.push(x, y, 10 - 0.03 * (x * x + y * y))
for (let y = 0; y < 40; y++)
  for (let x = 0; x < 40; x++) {
    const a = x + y * side
    tris.push(a, a + 1, a + side, a + 1, a + side + 1, a + side)
  }
const surface = { pts, tris }
const chamber = {
  id: 'c',
  name: 'Test',
  frameId: 'f',
  pose: { origin: [3, 2, 20], angles: [0, 0, 0] },
  innerRadius: 5,
  wallThickness: 1,
  height: 10,
}
const profile = fitChamberBase(chamber, [surface], 'skull', ['mesh'])
assert.ok(Math.max(...profile.outerDepths) - Math.min(...profile.outerDepths) > 1)
assert.equal(profile.source, 'skull')
for (let i = 0; i < 64; i++)
  for (const [r, depth] of [
    [5, profile.innerDepths[i]],
    [6, profile.outerDepths[i]],
  ]) {
    const angle = (i * 2 * Math.PI) / 64
    const p = localToWorld(chamber.pose, [r * Math.cos(angle), r * Math.sin(angle), 0])
    assert.ok(Math.abs(raySurfaceDistance(p, [0, 0, -1], [surface]) - depth - 0.5) < 1e-8)
  }
const mesh = ring(chamber.pose, 5, 6, 10, 64, profile)
assert.equal(mesh.pts[2], 20)
assert.ok(Math.abs(mesh.pts[64 * 3 + 2] - (20 - profile.outerDepths[0])) < 1e-5)
assert.throws(() => fitChamberBase(chamber, [], 'brain', ['missing']), /continuous surface/)
assert.throws(
  () =>
    fitChamberBase({ ...chamber, pose: { origin: [100, 0, 20], angles: [0, 0, 0] } }, [surface], 'brain', [
      'mesh',
    ]),
  /continuous surface/,
)
assert.equal(raySurfaceDistance([0, 0, 20], [0, 0, 1], [surface]), Infinity)
console.log(
  '  ok - curved rim follows analytical surface with specified gap while preserving top plane; incomplete coverage is rejected',
)

const lateral = {
  pts: Array.from({ length: pts.length }, (_, i) =>
    i % 3 === 0 ? 10 - 0.02 * pts[i] ** 2 - 0.04 * pts[i + 1] ** 2 : i % 3 === 1 ? pts[i] : -pts[i - 2],
  ),
  tris,
}
const sideChamber = { ...chamber, pose: { origin: [20, 2, -3], angles: [0, 0, 0] } }
assert.throws(() => fitChamberBase(sideChamber, [lateral], 'brain', ['mesh']), /continuous surface/)
for (const mesh of [
  lateral,
  { ...lateral, tris: tris.flatMap((_, i) => (i % 3 === 0 ? [tris[i + 2], tris[i + 1], tris[i]] : [])) },
]) {
  const aligned = alignChamberToSurface(sideChamber, [mesh])
  assert.ok(axes(aligned.pose)[2][0] > 0.9, 'Lateral chamber points outward instead of remaining vertical')
  const fitted = fitChamberBase(aligned, [mesh], 'brain', ['mesh'])
  assert.ok(Math.max(...fitted.outerDepths) - Math.min(...fitted.outerDepths) > 0.1)
  assert.deepEqual(
    sideChamber.pose,
    { origin: [20, 2, -3], angles: [0, 0, 0] },
    'Alignment is a nonmutating preview',
  )
}
console.log(
  '  ok - lateral surface alignment rotates an unsupported vertical chamber and fits unequal walls independent of triangle winding',
)
// Surface sampling detail should shorten a fitted wall, not reject an otherwise supported chamber.
const textured={pts:pts.map((v,i)=>i%3===2?v+.3*Math.sin(2*pts[i-2])*Math.cos(2*pts[i-1]):v),tris}
const texturedFit=fitChamberBase(chamber,[textured],'skull',['mesh'])
assert.ok(texturedFit.maxAdditionalGap>.05,'High spots between samples must produce an explicit conservative wall adjustment')
const fittedGeometry=ring(chamber.pose,5,6,10,64,texturedFit)
for(let i=0;i<64;i++)for(let offset=18;offset<24;offset+=3){
 const ids=[0,1,2].map(k=>fittedGeometry.tris[i*24+offset+k]),point=[0,1,2].map(k=>ids.reduce((sum,id)=>sum+fittedGeometry.pts[id*3+k]/3,0))
 const distance=raySurfaceDistance([point[0],point[1],20],[0,0,-1],[textured])
 assert.ok(point[2]>=20-distance+.5-.051,'The rendered rim triangles must clear supported surface detail instead of cutting into it')
}
console.log('  ok - textured skull fit shortens unequal walls, reports extra clearance, and keeps rendered triangle interiors outside bone')
