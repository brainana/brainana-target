import assert from 'node:assert/strict'
import { createProject } from '@brainana/planning-core/model.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
import { stereotaxPresets, defaultEarBar, compatibleEarBars } from '@brainana/planning-core/stereotax.ts'
import { frameChoices, speciesEarBars, speciesAdaptors, createStereotax, basePlateDefaults, defaultPlateForFrame, standardArm, armKinematics } from '@brainana/planning-core/stereotaxSetup.ts'
import { stereotaxGeometryParts } from '../src/render/stereotaxGeometry.ts'
import { inspectSurface } from '../src/render/surfaceInspection.ts'
import { createAsset } from '../src/data/assets.ts'
import { packProject, unpackProject } from '../src/data/archive.ts'
const all=Object.keys(stereotaxPresets)
assert.deepEqual(frameChoices(),all);assert.deepEqual(frameChoices('other'),all)
for(const species of ['mouse','rat','tree-shrew']){
 assert.ok(frameChoices(species).includes('kopf-900'))
 assert.ok(!frameChoices(species).includes('kopf-1430'))
 assert.ok(!frameChoices(species).includes('kopf-1530m'))
}
assert.ok(!frameChoices('macaque').includes('kopf-900'))
assert.ok(frameChoices('marmoset').includes('narishige-sr6cht'))
assert.equal(createStereotax('mouse',[0,0,0]).earBarId,'922')
assert.equal(createStereotax('rat',[0,0,0]).earBarId,'957')
assert.equal(createStereotax('marmoset',[0,0,0]).earBarId,'EB-3A')
assert.ok(!speciesEarBars('kopf-900','mouse').some(bar=>bar.id==='951'))
assert.ok(!speciesEarBars('kopf-900','rat').some(bar=>bar.id==='922'))
assert.ok(speciesAdaptors('kopf-900','mouse').some(item=>item.id==='926'))
assert.ok(!speciesAdaptors('kopf-900','mouse').some(item=>item.id==='920'))
const bar=compatibleEarBars('kopf-900').find(item=>item.id==='957')
assert.equal(bar.width,6.3);assert.equal(bar.scale,35);assert.equal(bar.taper,18);assert.equal(bar.radius,.8)
const data=new Uint8Array([1,2,3]),asset=await createAsset('image.nii','anatomy','frame',data)
const project=createProject(asset,'Catalog test',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
for(const id of all){
 const rig={preset:id,pose:{origin:[0,0,0],angles:[0,0,0]},railDropMm:0,earTipSpacingMm:10,showEarBars:true,earBarId:defaultEarBar[id],basePlate:defaultPlateForFrame(id),arms:[standardArm(id)]}
 project.stereotax=rig;validateProject(project)
 for(const part of stereotaxGeometryParts(rig))assert.ok(inspectSurface(part.geometry).valid,`${id} ${part.kind} must be finite and structurally valid`)
}
const rig=createStereotax('rat',[0,0,0]);project.stereotax=rig
const parts=stereotaxGeometryParts(rig),plate=parts.find(part=>part.kind==='base').geometry
const min=k=>Math.min(...Array.from(plate.pts).filter((_,i)=>i%3===k)),max=k=>Math.max(...Array.from(plate.pts).filter((_,i)=>i%3===k))
assert.ok(Math.abs(max(0)-min(0)-254)<1e-4)
assert.ok(Math.abs(max(1)-min(1)-353.06)<1e-4)
assert.ok(Math.abs(min(1)+222.5802)<1e-4)
assert.equal(max(2),-53)
const open=defaultPlateForFrame('kopf-930');assert.equal(open.lengthMm,431.8);assert.equal(open.posteriorMm,234.95)
assert.equal(basePlateDefaults('1211').thicknessMm,9.525)
assert.equal(basePlateDefaults('912').thicknessMm,25.4)
const detailed=parts.reduce((sum,part)=>sum+part.geometry.tris.length,0)
const simple=stereotaxGeometryParts({...rig,showDetails:false}).reduce((sum,part)=>sum+part.geometry.tris.length,0)
assert.ok(detailed>simple)
rig.earTipCenterMm=2;rig.earBlockOffsets={left:{apMm:3,heightMm:2},right:{apMm:-2,heightMm:1}}
rig.arms[0].stageXmm=20;rig.arms[0].stageYmm=-10;rig.arms[0].stageZmm=-15;rig.arms[0].toolTiltXDeg=30
const before=armKinematics(rig,rig.arms[0]);assert.ok(before.tip.every(Number.isFinite))
const zero=armKinematics(rig,{...rig.arms[0],stageXmm:0,stageYmm:0,stageZmm:0})
assert.ok(Math.hypot(...before.holder.map((value,i)=>value-zero.holder[i]))>20)
assert.ok(Math.abs(Math.hypot(...before.holder.map((v,i)=>v-before.tip[i]))-20)<1e-5)
const ears=stereotaxGeometryParts(rig).find(part=>part.kind==='ears').geometry
assert.ok(Math.abs(ears.pts[0]-(-rig.earTipSpacingMm/2+2))<1e-5)
assert.ok(Math.abs(ears.pts[1]-3)<1e-5);assert.ok(Math.abs(ears.pts[2]-2)<1e-5)
validateProject(project)
const saved=await unpackProject(await packProject(project,new Map([[asset.id,data]])))
assert.deepEqual(saved.project.stereotax,rig)
const invalid=structuredClone(project);invalid.stereotax.arms[0].stageXmm=41
assert.throws(()=>validateProject(invalid),/published travel/)
rig.basePlate=basePlateDefaults('1211')
const socket=stereotaxGeometryParts(rig).find(part=>part.kind==='base').geometry
assert.ok(inspectSurface(socket).valid)
console.log(`Species filtering, ${all.length} frames, rodent tip dimensions, published base geometry, articulated XYZ/tilt, individual ear offsets, socket geometry, physical travel and portable round-trip passed.`)
