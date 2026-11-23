import assert from 'node:assert/strict'
import {skullPreview} from '../src/render/ctSkull.ts'
import {inspectSurface} from '../src/render/surfaceInspection.ts'
import {SurfaceRayIndex} from '../../../packages/planning-core/surface-rays.ts'
import {raySurfaceDistance,fitChamberBase} from '../../../packages/planning-core/surface-fit.ts'
import {ctSurfaceKey} from '../src/render/ctSurfaceKey.ts'
const bounds=[[-15,-15,-15],[15,15,15]],options={spacingMm:.5,components:'largest',representation:'outer',center:[0,0,0]}
const shell={sample:p=>{const r=Math.hypot(...p);return r>=8&&r<=10?1000:0}}
const mesh=skullPreview(shell,300,bounds,options)
assert.ok(mesh.report.outer.coverage>.99)
assert.ok(inspectSurface(mesh).valid)
// One outer shell, not inner+outer walls. All vertices stay close to the outer radius.
for(let i=0;i<mesh.pts.length;i+=3)assert.ok(Math.abs(Math.hypot(...mesh.pts.slice(i,i+3))-10)<.65)
const index=new SurfaceRayIndex([mesh])
for(const direction of [[0,0,1],[1,0,0],[0,1,0],[0,0,-1]]){
 const distance=index.distance([0,0,0],direction)
 assert.ok(Math.abs(distance-10)<.6)
 assert.ok(Math.abs(distance-raySurfaceDistance([0,0,0],direction,[mesh]))<1e-6)
}
const chamber={id:'c',name:'test',frameId:'f',pose:{origin:[0,0,18],angles:[0,0,0]},innerRadius:2,wallThickness:.5,height:8}
const fit=fitChamberBase(chamber,[mesh],'skull',['ct'])
assert.ok(fit.outerDepths.every(v=>v>7&&v<10))
// A real opening stays open. The opposite skull wall is not accepted as support before the target plane.
const hole={sample:p=>p[2]>6&&Math.hypot(p[0],p[1])<4?0:shell.sample(p)}
const holed=skullPreview(hole,300,bounds,options),holeIndex=new SurfaceRayIndex([holed])
assert.ok(holed.report.outer.missingRays>0)
assert.equal(holeIndex.distance([0,0,18],[0,0,-1],18),Infinity)
assert.throws(()=>fitChamberBase(chamber,[holed],'skull',['ct']),/continuous|gap|curv/)
// Cropping through bone cannot generate a flat mounting cap.
const cropped=skullPreview(shell,300,[[-15,-15,-15],[15,15,8]],options)
assert.ok(cropped.report.outer.croppedRays>0)
assert.equal(new SurfaceRayIndex([cropped]).distance([0,0,18],[0,0,-1],18),Infinity)
assert.ok(cropped.pts.every((v,i)=>i%3!==2||v<7.8))
// Distractor larger than skull: explicit component seed must isolate skull and remove scanner bed.
const bed={sample:p=>p[0]>11&&p[0]<14?1000:shell.sample(p)}
const selected=skullPreview(bed,300,bounds,{...options,componentSeed:[9,0,0]})
assert.ok(selected.report.removedVoxels>0)
for(let i=0;i<selected.pts.length;i+=3)assert.ok(Math.hypot(...selected.pts.slice(i,i+3))<10.7)
assert.throws(()=>skullPreview(shell,300,bounds,{...options,componentSeed:[0,0,0]}),/not counted as bone/)
assert.throws(()=>skullPreview(shell,300,bounds,{...options,center:[9,0,0]}),/on skull bone/)
assert.throws(()=>skullPreview(shell,300,bounds,{...options,center:[20,0,0]}),/inside the brain/)
assert.notEqual(ctSurfaceKey({...options,threshold:300,bounds}),ctSurfaceKey({...options,threshold:300,bounds,center:[1,0,0]}))
assert.notEqual(ctSurfaceKey({...options,threshold:300,bounds}),ctSurfaceKey({...options,threshold:300,bounds,componentSeed:[9,0,0]}))
// Winding is outward; selected component, center and native resolution survive JSON persistence.
for(let t=0;t<mesh.tris.length;t+=3){const ps=[0,1,2].map(k=>Array.from(mesh.pts.slice(mesh.tris[t+k]*3,mesh.tris[t+k]*3+3))),u=ps[1].map((v,k)=>v-ps[0][k]),v=ps[2].map((v,k)=>v-ps[0][k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert.ok(n.reduce((s,v,k)=>s+v*ps[0][k],0)>0)}
console.log('Outer skull only, bed/component correction, missing-bone support rejection, no crop caps, outward normals, curved chamber conformity and cache invalidation passed.')
// Full placement -> apply -> base conformity uses the same supported exterior mesh.
const {createProject,addAssembly}=await import('../../../packages/planning-core/model.ts')
const {searchTarget,applyCandidate,settings}=await import('../../../packages/planning-core/optimization.ts')
const p=createProject({id:'ct',name:'ct.nii',role:'anatomy',modality:'ct',frameId:'frame',sha256:'a'.repeat(64),sourcePath:null},'Outer support',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
p.assets[0].imageDisplay={min:0,max:1000,opacity:.85,colormap:'cool',visible:true,skull:{...options,threshold:300,bounds,useForPlanning:true,show:true}};p.planningSurfaceIds=['ct']
addAssembly(p,[0,0,18]);p.chambers[0].innerRadius=1.5;p.chambers[0].wallThickness=.5;p.chambers[0].height=6
p.targets.push({id:'t',name:'target',point:[0,0,0],frameId:p.frame.id,color:'#ffffff',atlas:null})
p.planning={...settings(p),mode:'new',seed:[0,0,18],searchStep:2,margin:0}
const searchOptions={surface:holed.pts,supportSurfaces:[holed],supportSource:'skull',supportAssetIds:['ct'],expand:true}
const placements=searchTarget(p,p.electrodes[0].id,'t',searchOptions)
assert.ok(placements.rejectedSupport>0,'Access through the unsupported opening must be rejected')
assert.ok(placements.candidates.length>0,'Lateral supported skull must remain usable')
applyCandidate(p,p.electrodes[0].id,'t',placements.candidates[0],searchOptions)
const appliedFit=fitChamberBase(p.chambers[0],[holed],'skull',['ct'])
assert.equal(appliedFit.outerDepths.length,64)
assert.deepEqual(p.chambers[0].baseFit,appliedFit)
const {validateProject}=await import('../../../packages/planning-core/validation.ts');validateProject(p)
console.log('End-to-end search relocates around unsupported skull, applies a feasible pose, and conforms its base to the same exterior mesh.')

const {surfaceContours}=await import('../src/render/surfaceContours.ts')
for(const normal of [0,1,2]){
 const segments=surfaceContours(mesh,normal,0)
 assert.ok(segments.length>24)
 for(let i=normal;i<segments.length;i+=3)assert.ok(Math.abs(segments[i])<1e-5)
 for(let i=0;i<segments.length;i+=3)assert.ok(Math.abs(Math.hypot(...segments.slice(i,i+3))-10)<.7)
 assert.deepEqual(surfaceContours(mesh,normal,20),[])
}
console.log('CT review contours are exact cardinal sections of the exterior mesh, with no contours on its removed inner wall.')
