import assert from 'node:assert/strict'
import {createProject,addAssembly} from '../model.ts'
import {searchTarget,applyCandidate} from '../optimization.ts'
import {trajectory,length,sub} from '../geometry.ts'
import {SurfaceRayIndex} from '../surface-rays.ts'
import {sphere} from '../../../apps/planner/src/render/primitives.ts'
const p=createProject({id:'a',name:'mri.nii',role:'anatomy',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Local',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,40]);const c=p.chambers[0],g=p.grids[0],e=p.electrodes[0];c.innerRadius=5;c.height=10;g.minimumThickness=2;g.holeDiameter=1;e.depth=30;p.targets=[{id:'t',frameId:p.frame.id,name:'T',point:[27,8,0],color:'#ffffff',atlas:null}];p.planning={mode:'new',seed:null,searchStep:2,searchRadius:10,maxMiss:.5,margin:0}
const mesh=sphere([0,0,0],30,64,32);for(let i=0;i<mesh.pts.length;i+=3){mesh.pts[i+1]*=.7;mesh.pts[i+2]*=.85}
const index=new SurfaceRayIndex([mesh])
for(let i=0;i<25;i++){const direction=[Math.cos(i),Math.sin(i),Math.cos(i*.7)],origin=[3,-4,2];let exact=-Infinity;for(let j=0;j<mesh.pts.length;j+=3)exact=Math.max(exact,direction.reduce((s,v,k)=>s+(mesh.pts[j+k]-origin[k])*v,0));assert.ok(Math.abs(index.maximumProjection(origin,direction)-exact)<1e-10)}
const options={surface:mesh.pts,supportSurfaces:[mesh],supportAssetIds:['s'],supportSource:'skull',accessPoint:[30,0,0],maximumLocalGridTilt:30},before=structuredClone(p)
const result=searchTarget(p,e.id,'t',options)
assert.ok(result.candidates.length>0,'Tangential near-surface target has a local fit with an angled grid')
assert.deepEqual(p,before,'Search leaves defined hardware unchanged')
for(const candidate of result.candidates){assert.ok(length(sub(candidate.surfaceCenter,options.accessPoint))<=1);assert.ok(candidate.gridConfiguration.tiltAngle<=30);assert.ok(candidate.baseFit);assert.ok(candidate.miss<.5)}
assert.ok(result.candidates.some(c=>c.gridConfiguration.tiltAngle>1),'Actual alternative grid tilt was explored')
const applied=structuredClone(p);applyCandidate(applied,e.id,'t',result.candidates[0],options)
assert.ok(length(sub(trajectory(applied.chambers[0],applied.grids[0],applied.electrodes[0]).tip,p.targets[0].point))<.5)
assert.equal(applied.chambers[0].innerRadius,c.innerRadius);assert.equal(applied.chambers[0].wallThickness,c.wallThickness)
const blocked=structuredClone(p);blocked.avoidRegions=[{id:'r',name:'Blocked target',frameId:p.frame.id,center:p.targets[0].point,radius:3,constraint:'hard'}];const conflict=searchTarget(blocked,e.id,'t',options);assert.equal(conflict.candidates.length,0);assert.ok(conflict.manualConflict);assert.equal(conflict.manualConflict.conflicts[0].id,'r');assert.throws(()=>applyCandidate(blocked,e.id,'t',conflict.manualConflict.candidate,options),/no longer valid/)
const short=structuredClone(p);short.electrodes[0].length=1;assert.equal(searchTarget(short,e.id,'t',options).candidates.length,0)
const stale=structuredClone(p);stale.chambers[0].innerRadius=6;assert.throws(()=>applyCandidate(stale,e.id,'t',result.candidates[0],options),/no longer valid/)
console.log('Clicked lateral skull location: alternative angled grid reaches near-surface target, keeps clicked center and chamber dimensions, fits rim, respects hard avoidance/length, and rejects stale apply. Exact BVH support matches brute-force vertices.')
