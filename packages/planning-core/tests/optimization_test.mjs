import assert from 'node:assert/strict'
import { createProject, addAssembly } from '../model.ts'
import { applyCandidate, clearance, regionClearance, searchTarget, settings } from '../optimization.ts'
import { fitTarget } from '../targeting.ts'
import { validateProject } from '../validation.ts'
const p = createProject(
  {
    id: 'image',
    name: 'image.nii',
    role: 'anatomy',
    frameId: 'frame',
    sha256: 'a'.repeat(64),
    sourcePath: null,
  },
  'Plan',
  { kind: 'standalone', subject: null, scan: null, sourceRoot: null },
)
addAssembly(p, [0, 0, 30])
const e = p.electrodes[0],
  c = p.chambers[0],
  g = p.grids[0]
p.targets.push({
  id: 'target',
  name: 'Target',
  point: [0, 0, 0],
  frameId: p.frame.id,
  color: '#ffffff',
  atlas: null,
})
p.planning = { ...settings(p), mode: 'existing', maxMiss: 1, margin: 0 }
p.avoidRegions = [{ id: 'avoid', name: 'Avoid', frameId: p.frame.id, center: [0, 0, 15], radius: 0.3 }]
let result = searchTarget(p, e.id, 'target')
assert.ok(result.rejectedAvoidance > 0)
assert.equal(result.candidates[0].miss, 1)
assert.ok(result.candidates[0].clearance > 0)
const pose = structuredClone(c.pose)
applyCandidate(p, e.id, 'target', result.candidates[0])
assert.deepEqual(c.pose, pose)
assert.notDeepEqual(e.hole, [0, 0])
assert.throws(() => fitTarget(p, e.id, 'target', true), /keeps the chamber/)
console.log('  ok - fixed-chamber search finds an alternate hole while preserving measured pose')
p.planning.maxMiss = 0.1
result = searchTarget(p, e.id, 'target')
assert.equal(result.candidates.length, 0)
assert.throws(() => fitTarget(p, e.id, 'target'), /avoidance/)
console.log('  ok - blocked fixed chambers report no feasible candidate without relaxing tolerance')
p.planning = { ...settings(p), mode: 'new', seed: [0, 0, 30], searchRadius: 10, searchStep: 1, margin: 1 }
p.avoidRegions[0].radius = 2
result = searchTarget(p, e.id, 'target')
assert.ok(result.candidates.length > 0)
assert.ok(result.candidates[0].displacement > 0)
assert.ok(result.candidates.every((x) => x.clearance >= 1 - 1e-8 && x.miss < 1e-8))
assert.ok(result.candidates.every((x) => x.displacement >= result.candidates[0].displacement))
const candidate = result.candidates[0]
applyCandidate(p, e.id, 'target', candidate)
assert.ok(clearance(p, c, g, e) >= 1 - 1e-8)
validateProject(p)
console.log('  ok - new-chamber search relocates access around an obstacle and reaches target exactly')
// Start with an intentionally blocked zero-radius search; widening is automatic.
const exterior = structuredClone(p)
exterior.planning.searchRadius = 0
exterior.planning.seed = [0, 0, 15] // preferred origin inside the anatomy
const surface = []
for (const x of [-10, 10]) for (const y of [-10, 10]) for (const z of [-10, 10]) surface.push(x, y, z)
const options = { surface, expand: true }
const expanded = searchTarget(exterior, e.id, 'target', options)
assert.ok(expanded.radiusUsed > 0)
assert.ok(expanded.candidates.length > 0)
for (const candidate of expanded.candidates) {
  const direction = candidate.pose.origin.map((v) => v / Math.hypot(...candidate.pose.origin))
  const bottomDistance = Math.hypot(...candidate.pose.origin) - exterior.chambers[0].height
  for (let i = 0; i < surface.length; i += 3)
    assert.ok(
      bottomDistance -
        (surface[i] * direction[0] + surface[i + 1] * direction[1] + surface[i + 2] * direction[2]) >=
        1 - 1e-8,
    )
}
applyCandidate(exterior, e.id, 'target', expanded.candidates[0], options)
assert.ok(clearance(exterior, exterior.chambers[0], exterior.grids[0], exterior.electrodes[0]) >= 1 - 1e-8)
console.log(
  '  ok - automatic expansion finds an exterior chamber; its entire base plane clears every anatomical surface vertex',
)
p.avoidRegions[0].radius = 100
const before = structuredClone(p)
assert.throws(() => applyCandidate(p, e.id, 'target', candidate), /no longer valid/)
assert.deepEqual(p, before)
assert.equal(searchTarget(p, e.id, 'target').candidates.length, 0)
console.log('  ok - stale and infeasible candidates leave all hardware unchanged')
assert.equal(
  regionClearance([0, 0, 10], [0, 0, 0], 2, { ...p.avoidRegions[0], center: [0, 0, -5], radius: 1 }),
  3,
)
assert.equal(
  regionClearance([0, 0, 10], [0, 0, 0], 2, { ...p.avoidRegions[0], center: [3, 0, 5], radius: 1 }),
  1,
)
assert.equal(
  regionClearance([0, 0, 0], [0, 0, 0], 2, { ...p.avoidRegions[0], center: [3, 0, 0], radius: 1 }),
  1,
)
console.log(
  '  ok - finite-segment clearance includes shaft radius and handles endpoint and zero-length paths',
)
for (const mutate of [
  (d) => (d.avoidRegions[0].radius = -1),
  (d) => (d.avoidRegions[0].frameId = 'other'),
  (d) => (d.planning.margin = NaN),
  (d) => (d.planning.searchStep = 0),
  (d) => (d.planning.mode = 'unknown'),
]) {
  const draft = structuredClone(p)
  mutate(draft)
  assert.throws(() => validateProject(draft), /Invalid project/)
}
const legacy = structuredClone(p)
delete legacy.planning
delete legacy.avoidRegions
validateProject(legacy)
const noHardware = structuredClone(legacy)
noHardware.chambers = []
noHardware.grids = []
noHardware.electrodes = []
validateProject(noHardware)
console.log(
  '  ok - new constraints validate, and legacy projects and anatomy without hardware remain supported',
)
const multi = structuredClone(p)
multi.chambers[0].pose = { origin: [0, 0, 30], angles: [0, 0, 0] }
multi.planning.seed = [0, 0, 30]
multi.planning.searchRadius = 0
multi.avoidRegions = [
  { id: 'avoid', name: 'Avoid', frameId: multi.frame.id, center: [3, 0, 15], radius: 0.3 },
]
multi.electrodes.push({ ...multi.electrodes[0], id: 'other', hole: [3, 0], depth: 30 })
const multiResult = searchTarget(multi, e.id, 'target')
assert.equal(multiResult.candidates.length, 0)
assert.equal(multiResult.rejectedOtherElectrodes, 1)
console.log('  ok - relocating a new chamber cannot move another electrode through a marked region')

const { segmentDistance } = await import('../optimization.ts')
assert.equal(segmentDistance([0, 0, 0], [10, 0, 0], [5, -5, 0], [5, 5, 0]), 0)
assert.equal(segmentDistance([0, 0, 0], [10, 0, 0], [0, 3, 0], [10, 3, 0]), 3)
assert.equal(segmentDistance([0, 0, 0], [10, 0, 0], [15, 0, 0], [20, 0, 0]), 5)
const brush = {
  id: 'brush',
  name: 'Brush',
  frameId: p.frame.id,
  center: [-10, 0, 15],
  radius: 1,
  points: [
    [-10, 0, 15],
    [10, 0, 15],
  ],
}
assert.equal(regionClearance([0, 0, 30], [0, 0, 0], 0.3, brush), -1.15)
assert.equal(regionClearance([0, 3, 30], [0, 3, 0], 0.3, brush), 1.85)
const painted = structuredClone(legacy)
painted.avoidRegions = [brush]
painted.chambers[0].pose = { origin: [0, 0, 30], angles: [0, 0, 0] }
painted.planning = { ...settings(painted), mode: 'existing', maxMiss: 0.1, margin: 0 }
assert.equal(searchTarget(painted, e.id, 'target').candidates.length, 0)
validateProject(painted)
painted.avoidRegions[0].points = []
assert.throws(() => validateProject(painted), /brush stroke/)
console.log(
  '  ok - continuous brush segments constrain trajectories between sampled points, not just at endpoints',
)

const short = structuredClone(exterior)
short.electrodes[0].length = 5
short.electrodes[0].depth = 5
const tooShort = searchTarget(short, e.id, 'target', options)
assert.equal(tooShort.candidates.length, 0)
assert.ok(tooShort.rejectedDepth > 0)
assert.equal(tooShort.usableLength, 5)
assert.ok(tooShort.minimumRequiredDepth > tooShort.usableLength)
assert.ok(tooShort.maximumRequiredDepth >= tooShort.minimumRequiredDepth)
assert.equal(tooShort.rejectedDepth, tooShort.tested)
assert.deepEqual(short.electrodes[0].depth, 5)
console.log('  ok - impossible short reach reports numerical sampled depth requirements without changing hardware')
const farSide = structuredClone(exterior)
farSide.planning.seed = [0, 0, 30]
farSide.planning.searchRadius = 0
farSide.avoidRegions = [
  { id: 'cap', name: 'Upper cap', frameId: farSide.frame.id, center: [0, 0, 20], radius: 18 },
]
const fullSearch = searchTarget(farSide, e.id, 'target', options)
assert.ok(fullSearch.candidates.some((c) => c.pose.origin[2] < 0))
assert.ok(fullSearch.candidates.every((c) => c.depth <= (farSide.electrodes[0].length ?? 150)))
console.log('  ok - full-envelope search reaches the far side and respects specified shaft length')
// Soft preferences rank feasible placements, report unavoidable conflicts, and never relax hard exclusions.
{
 const q=createProject({...p.assets[0]},'Priorities',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(q,[0,0,30])
 q.targets=[{id:'t',name:'T',point:[0,0,0],frameId:q.frame.id,color:'#ffffff',atlas:null}]
 q.planning={mode:'existing',seed:null,searchRadius:10,searchStep:2,maxMiss:10,margin:0}
 const device=q.electrodes[0]
 q.avoidRegions=[{id:'soft',name:'Preferred clean track',frameId:q.frame.id,center:[0,0,15],radius:1,constraint:'soft'}]
 let r=searchTarget(q,device.id,'t');assert.ok(r.candidates.length);assert.equal(r.candidates[0].softViolations.length,0,'A sampled placement that avoids soft regions must outrank a conflicting placement')
 q.avoidRegions[0].center=[0,0,0];q.avoidRegions[0].radius=100
 r=searchTarget(q,device.id,'t');assert.ok(r.candidates.length);assert.ok(r.candidates.every(c=>c.softViolations.length===1),'Unavoidable soft conflicts are reported without being rejected')
 const old=structuredClone(r.candidates[0]);q.avoidRegions[0].constraint='hard';assert.equal(searchTarget(q,device.id,'t').candidates.length,0,'Hard exclusions remain mandatory')
 assert.throws(()=>applyCandidate(q,device.id,'t',old),/no longer valid/)
 q.avoidRegions[0].constraint='ignore';r=searchTarget(q,device.id,'t');assert.ok(r.candidates.length);assert.equal(r.candidates[0].softViolations,undefined);assert.equal(r.candidates[0].clearance,Infinity)
 validateProject(q)
 console.log('  ok - hard/soft/ignored region semantics, soft ranking, unavoidable-conflict reporting and stale priority rejection')
}
// A shallow target does not require the entire mounting ring to be above its target plane.
{
 const pts=[],tris=[],n=41
 for(let y=-20;y<=20;y++)for(let x=-20;x<=20;x++)pts.push(x,y,30-.02*(x*x+y*y))
 for(let y=0;y<40;y++)for(let x=0;x<40;x++){const a=x+y*n;tris.push(a,a+1,a+n,a+1,a+n+1,a+n)}
 for(const lateral of [false,true]){
  const surface={outerEnvelope:true,pts:Float32Array.from(pts.map((v,i)=>lateral?(i%3===0?pts[i+2]:i%3===1?v:-pts[i-2]):v)),tris:new Uint32Array(tris)}
  const q=createProject({...p.assets[0]},'14 mm chamber shallow target',{kind:'standalone',subject:null,scan:null,sourceRoot:null});q.assets.push({...q.assets[0],id:'cap',name:'skull.obj',role:'surface',surfaceKind:'skull'});addAssembly(q,lateral?[43,0,0]:[0,0,43])
  const chamber=q.chambers[0];chamber.innerRadius=7;chamber.wallThickness=1;chamber.height=12;chamber.placementState='unplaced'
  q.targets=[{id:'t',name:'Shallow',point:lateral?[29.9,0,0]:[0,0,29.9],frameId:q.frame.id,color:'#ffffff',atlas:null}]
  q.planning={mode:'new',seed:lateral?[43,0,0]:[0,0,43],searchRadius:10,searchStep:8,maxMiss:.5,margin:0}
  const options={surface:surface.pts,supportSurfaces:[surface],supportSource:'skull',supportAssetIds:['cap'],expand:true}
  const r=searchTarget(q,q.electrodes[0].id,'t',options);assert.ok(r.candidates.length,'A fully supported 14 mm chamber must reach a shallow target')
  assert.ok(r.candidates[0].displacement<1e-6,'The direct supported placement must not be rejected in favour of the opposite side')
  assert.ok(r.candidates[0].baseFit.outerDepths.some(d=>d>r.candidates[0].depth),'Side walls may extend beyond the shallow central target plane')
  assert.ok(r.candidates[0].surfaceCenter,'Validated candidates expose their physical surface center for map picking')
  assert.ok(Math.hypot(...r.candidates[0].surfaceCenter.map((v,k)=>v-(lateral?[30,0,0]:[0,0,30])[k]))<1e-5)
  applyCandidate(q,q.electrodes[0].id,'t',r.candidates[0],options);validateProject(q)
 }
 console.log('  ok - 14 mm chamber on superior/lateral skull caps reaches a 0.1 mm-deep target with fitted unequal wall lengths')
}

// With no explicit access preference, a posterior/lateral target should use nearby skull,
// even when this requires a nearly horizontal chamber axis.
{
 const pts=[],tris=[],rings=24,segments=48,R=40
 for(let j=0;j<=rings;j++){const a=Math.PI*j/rings;for(let i=0;i<segments;i++){const b=2*Math.PI*i/segments;pts.push(R*Math.sin(a)*Math.cos(b),R*Math.sin(a)*Math.sin(b),R*Math.cos(a))}}
 for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*segments+i,b=j*segments+(i+1)%segments;tris.push(a,b,a+segments,b,b+segments,a+segments)}
 // Ensure outward winding for the outer-envelope support check.
 for(let i=0;i<tris.length;i+=3){const ids=tris.slice(i,i+3),a=ids.map(id=>pts.slice(id*3,id*3+3)),u=a[1].map((v,k)=>v-a[0][k]),v=a[2].map((v,k)=>v-a[0][k]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(normal.reduce((n,v,k)=>n+v*a[0][k],0)<0)[tris[i+1],tris[i+2]]=[tris[i+2],tris[i+1]]}
 const surface={outerEnvelope:true,pts:new Float32Array(pts),tris:new Uint32Array(tris)}
 const q=createProject({...p.assets[0]},'Lateral posterior target',{kind:'standalone',subject:null,scan:null,sourceRoot:null});q.assets.push({...q.assets[0],id:'skull',name:'skull.obj',role:'surface',surfaceKind:'skull'});addAssembly(q,[0,0,60])
 const c=q.chambers[0];c.innerRadius=7;c.wallThickness=1;c.height=12;c.placementState='unplaced'
 q.targets=[{id:'t',name:'Posterior lateral',point:[-30,-10,5],frameId:q.frame.id,color:'#ffffff',atlas:null}]
 q.planning={mode:'new',seed:null,searchRadius:10,searchStep:5,maxMiss:.5,margin:0}
 const opts={surface:surface.pts,supportSurfaces:[surface],supportSource:'skull',supportAssetIds:['skull'],expand:true}
 const result=searchTarget(q,q.electrodes[0].id,'t',opts)
 assert.ok(result.candidates.length)
 assert.ok(result.candidates[0].depth<26,`Automatic placement should favor nearby skull, not an artificial overhead preference (${result.candidates[0].depth} mm)`)
 const best=result.candidates[0],axis=best.pose.origin.map((v,k)=>v-q.targets[0].point[k]),norm=Math.hypot(...axis)
 assert.ok(axis[0]/norm<-.85,'A large lateral rotation is allowed and selected')
 assert.ok(best.miss<1e-6)
 const again=structuredClone(q);delete again.chambers[0].placementState;again.chambers[0].pose.origin=[60,0,0]
 const repeated=searchTarget(again,again.electrodes[0].id,'t',opts)
 assert.ok(Math.abs(repeated.candidates[0].depth-best.depth)<1e-6,'Automatic ranking must not inherit the old chamber location')
 const preferred=structuredClone(q);preferred.planning.seed=[-30,-10,53]
 const preferredResult=searchTarget(preferred,preferred.electrodes[0].id,'t',opts)
 assert.ok(preferredResult.candidates[0].displacement<1e-6,'Explicit user access preferences must remain honored')
 applyCandidate(q,q.electrodes[0].id,'t',best,opts);validateProject(q)
 console.log(`  ok - automatic posterior/lateral placement selects ${best.depth.toFixed(2)} mm reach at large tilt, ignores old pose, and preserves explicit access preferences`)
}

{
  const plan = createProject(p.assets[0], 'Two chambers', p.provenance)
  addAssembly(plan, [0, 0, 10])
  addAssembly(plan, [40, 0, 10])
  plan.planning = { ...settings(plan), mode: 'existing', maxMiss: .01, margin: 0 }
  const [left, right] = plan.chambers
  const [first, independent] = plan.electrodes
  plan.targets = [[0, 0, -5], [2, 0, -6], [40, 0, -5]].map((point, index) => ({
    id: 't' + index, name: 'Target ' + index, frameId: plan.frame.id, point, color: '#ffffff', atlas: null,
  }))
  left.targetIds = ['t0', 't1']
  right.targetIds = ['t2']
  const second = { ...first, id: 'second', name: 'Second probe', targetId: 't1' }
  plan.electrodes.push(second)
  validateProject(plan)
  const result = searchTarget(plan, first.id, 't0')
  assert.ok(result.candidates.length)
  assert.deepEqual(result.candidates[0].linkedFits?.map(fit => [fit.id, fit.hole, fit.depth]), [['second', [2, 0], 16]])
  assert.throws(() => searchTarget(plan, first.id, 't2'), /Assign this target/)
  const independentBefore = structuredClone(independent)
  applyCandidate(plan, first.id, 't0', result.candidates[0])
  assert.deepEqual(plan.electrodes[1], independentBefore)
  assert.deepEqual(plan.electrodes[2].hole, [2, 0])
  console.log('Linked targets restrict chamber choices and refit both electrodes on a shared grid without moving an independent chamber.')
}
