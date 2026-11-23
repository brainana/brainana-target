import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {NVMeshLoaders} from '@niivue/niivue'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {placementIssues} from '@brainana/planning-core/placement-feedback.ts'
import {searchTarget,recordAvoidanceFailure} from '@brainana/planning-core/optimization.ts'
import {applyHardwarePreset,hardwareCatalog} from '../src/hardware/catalog.ts'
import {unpackProject} from '../src/data/archive.ts'
const p=createProject({id:'a',name:'MRI',role:'anatomy',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Feedback',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,10]);const e=p.electrodes[0]
applyHardwarePreset(e,hardwareCatalog.find(v=>v.id==='plexon-u'));e.length=25;e.hardware.reservedLength=25
p.targets=[{id:'t',name:'Target',point:[0,0,-20],frameId:p.frame.id,color:'#ff0000',atlas:null}];e.targetId='t'
const r={candidates:[],tested:17,rejectedDepth:17,rejectedMiss:0,rejectedSupport:0,rejectedFootprint:0,rejectedWall:0,rejectedAvoidance:0,rejectedOtherElectrodes:0,radiusUsed:10,minimumRequiredDepth:31.28,maximumRequiredDepth:40.39,usableLength:25,minimumAllowedDepth:0}
const before=structuredClone(p),issues=placementIssues(p,e,r),depth=issues[0]
assert.equal(depth.kind,'depth');assert.match(depth.explanation,/6.28 mm/);assert.ok(depth.parameters.some(v=>v.name==='Total physical shaft length'&&v.value==='50.00 mm'));assert.ok(depth.parameters.some(v=>v.name==='Usable shaft length'&&v.value==='25.00 mm'))
assert.ok(depth.controls.some(v=>v.electrodeField==='totalLength'));assert.ok(depth.controls.some(v=>v.electrodeField==='reinforcement'));assert.ok(depth.controls.some(v=>v.feature==='chamber'&&v.field==='Chamber height (mm)'));assert.match(depth.guidance.join(' '),/full physical shaft/)
assert.deepEqual(p,before,'Diagnosing failure must never change actual hardware or constraints')
const zero=placementIssues(p,e,{...r,tested:0,rejectedDepth:0})
assert.equal(zero[0].kind,'coverage');assert.doesNotMatch(zero[0].title,/length/)
for(const [field,kind] of [['rejectedMiss','miss'],['rejectedFootprint','footprint'],['rejectedWall','wall'],['rejectedSupport','support'],['rejectedAvoidance','avoidance'],['rejectedOtherElectrodes','other']]){
 const issue=placementIssues(p,e,{...r,rejectedDepth:0,[field]:3}).find(v=>v.kind===kind)
 assert.ok(issue);assert.ok(issue.parameters.length);assert.ok(issue.controls.length);assert.ok(issue.guidance.length)
}
const obstacles={...r,rejectedDepth:0,rejectedAvoidance:2};recordAvoidanceFailure(obstacles,[{id:'post',name:'Existing post',clearance:-1}]);recordAvoidanceFailure(obstacles,[{id:'post',name:'Existing post',clearance:.2}]);assert.equal(obstacles.rejectionDetails.avoidance.length,1);assert.equal(obstacles.rejectionDetails.avoidance[0].bestClearance,.2)
assert.match(JSON.stringify(placementIssues(p,e,obstacles)),/Existing post/)
const direct=structuredClone(e);direct.direct={pose:{origin:[0,0,0],angles:[0,0,0]},unplaced:true};const directIssue=placementIssues(p,direct,r)[0];assert.match(directIssue.explanation,/electrode entry/);assert.ok(!directIssue.controls.some(v=>v.feature==='chamber'));assert.ok(!directIssue.parameters.some(v=>v.name==='Chamber height'))
const shallow=placementIssues(p,e,{...r,minimumRequiredDepth:1,maximumRequiredDepth:2,minimumAllowedDepth:5})[0];assert.match(shallow.title,/minimum/);assert.doesNotMatch(shallow.explanation,/shortfall/)
// Reproduce the supplied project without including the user's data in the source release.
if(process.env.PLANNER_REACH_PROJECT){
 const {project:p,bytes}=await unpackProject(new Uint8Array(await fs.readFile(process.env.PLANNER_REACH_PROJECT))),asset=p.assets.find(v=>p.planningSurfaceIds.includes(v.id)),mesh=NVMeshLoaders.readSTL(bytes.get(asset.id).slice().buffer),surface={pts:mesh.positions,tris:mesh.indices,outerEnvelope:true}
 const result=searchTarget(p,p.electrodes[0].id,p.targets[0].id,{surface:surface.pts,supportSurfaces:[surface],supportAssetIds:[asset.id],supportSource:'brain',accessPoint:[-14.17,-7.76,34.58],maximumLocalGridTilt:20})
 assert.equal(result.tested,17);assert.equal(result.rejectedDepth,17);assert.equal(result.candidates.length,0)
 const issue=placementIssues(p,p.electrodes[0],result)[0];assert.match(issue.explanation,/31.28 mm/);assert.match(issue.explanation,/6.28 mm/)
}
console.log('Placement diagnostics: total/reserved/usable reach, numeric shortfall, parameter destinations, all rejection types, missing coverage, direct entry, named obstacle evidence and immutable constraints passed.')
