import assert from 'node:assert/strict'
import {measurementSliceProjection} from '../src/render/measurementOverlay.ts'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {createStereotax,standardArm,armKinematics} from '@brainana/planning-core/stereotaxSetup.ts'
import {measureDistance,resolvePoint,resolveAxes,identifyArms,pointReferences} from '@brainana/planning-core/measurements.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {createAsset} from '../src/data/assets.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
import {measurementRows,measurementCsv} from '../src/data/measurementExport.ts'
import {coordinateRows,planReport} from '../src/data/export.ts'
import {ProjectStore} from '../src/state/store.ts'
import {unzipSync,strFromU8} from 'fflate'
const data=new Uint8Array([1,2,3]),asset=await createAsset('reference.nii','anatomy','frame',data)
const p=createProject(asset,'Measurements',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
p.landmarks=[{id:'a',name:'Fiducial A',frameId:'frame',point:[0,0,0]},{id:'b',name:'Fiducial B',frameId:'frame',point:[3,4,12]}]
const m={id:'distance',name:'A to B',from:{kind:'landmark',id:'a'},to:{kind:'landmark',id:'b'},axes:{kind:'image'},visible:true,color:'#ffca55'};p.measurements=[m]
assert.equal(measureDistance(p,m).distanceMm,13)
assert.deepEqual(measureDistance(p,m).offsetsMm,[3,4,12])
assert.deepEqual(measureDistance(p,{...m,from:m.to,to:m.from}).offsetsMm,[-3,-4,-12])
p.stereotax=createStereotax('rat',[10,20,30]);p.stereotax.pose.angles=[0,0,90]
p.stereotax.earTipSpacingMm=20;p.stereotax.earTipCenterMm=3;p.stereotax.earBlockOffsets={left:{apMm:2,heightMm:4},right:{apMm:6,heightMm:8}}
const midpoint=resolvePoint(p,{kind:'ear-midpoint'}).point
assert.ok(Math.abs(midpoint[0]-6)<1e-8);assert.ok(Math.abs(midpoint[1]-23)<1e-8);assert.equal(midpoint[2],36)
assert.notDeepEqual(midpoint,p.stereotax.pose.origin)
const rotated=measureDistance(p,{...m,axes:{kind:'frame'}})
assert.ok(Math.abs(rotated.offsetsMm[0]-4)<1e-8);assert.ok(Math.abs(rotated.offsetsMm[1]+3)<1e-8)
assert.equal(rotated.distanceMm,13)
addAssembly(p,[1,2,30]);p.grids[0].minimumThickness=2;p.grids[0].tiltAngle=20;p.grids[0].tiltAzimuth=45
for(const kind of ['chamber-center','grid-origin','electrode-entry','electrode-tip'])assert.ok(resolvePoint(p,{kind,id:kind.startsWith('chamber')?p.chambers[0].id:kind.startsWith('grid')?p.grids[0].id:p.electrodes[0].id}).point.every(Number.isFinite))
for(const reference of [{kind:'chamber',id:p.chambers[0].id},{kind:'grid',id:p.grids[0].id},{kind:'arm',id:p.stereotax.arms[0].id}]){
 const value=measureDistance(p,{...m,axes:reference});assert.ok(Math.abs(Math.hypot(...value.offsetsMm)-13)<1e-8,'Axes rotate offsets without rescaling distance')
}
p.stereotax.arms.push(standardArm(p.stereotax.preset,'right'))
const id=p.stereotax.arms[1].id,tip=resolvePoint(p,{kind:'arm-tip',id}).point
p.stereotax.arms.shift();assert.deepEqual(resolvePoint(p,{kind:'arm-tip',id}).point,tip)
assert.equal(resolvePoint(p,{kind:'arm-tip',id:'removed'}),null)
p.stereotax.arms[0].stageZmm=15
assert.notDeepEqual(resolvePoint(p,{kind:'arm-tip',id}).point,tip)
assert.deepEqual(resolvePoint(p,{kind:'arm-tip',id}).point,armKinematics(p.stereotax,p.stereotax.arms[0]).worldTip)
p.headposts=[{id:'post',name:'Headpost',frameId:'frame',pose:{origin:[1,2,3],angles:[0,0,0]},avoid:false,existing:false,reference:'custom',postDiameter:2,postHeight:10,baseDiameter:5,baseThickness:1}]
assert.deepEqual(resolvePoint(p,{kind:'headpost-base',id:'post'}).point,[1,2,3])
p.headposts[0].pose.origin=[4,5,6]
assert.deepEqual(resolvePoint(p,{kind:'headpost-base',id:'post'}).point,[4,5,6])
const fixed={kind:'point',name:'Contact snapshot',point:[7.25,8.125,9.0625]}
const resolved=resolvePoint(p,fixed);resolved.point[0]=9;assert.equal(fixed.point[0],7.25,'Resolved points cannot mutate stored references')
assert.ok(pointReferences(p).some(p=>p.reference.kind==='ear-midpoint'))
validateProject(p)
const payload=await packProject(p,new Map([[asset.id,data]])),archive=unzipSync(payload)
assert.match(strFromU8(archive['measurements.csv']),/A to B/)
assert.match(strFromU8(archive['dimensions-and-coordinates.json']),/"measurements"/)
assert.deepEqual((await unpackProject(payload)).project.measurements,p.measurements)
assert.ok(measurementRows(p).every(row=>row.length===measurementRows(p)[0].length))
assert.ok(coordinateRows(p).every(row=>row.length===coordinateRows(p)[0].length))
assert.match(planReport(p,null),/Saved measurements/)
assert.match(measurementCsv(p),/"13"/)
const store=new ProjectStore();store.replace(p);store.edit(d=>{d.landmarks[1].point=[0,0,5]})
assert.equal(measureDistance(store.project,store.project.measurements[0]).distanceMm,5)
store.undo();assert.equal(measureDistance(store.project,m).distanceMm,13)
store.redo();assert.equal(measureDistance(store.project,m).distanceMm,5)
const missing=structuredClone(p);missing.landmarks.pop();validateProject(missing)
assert.equal(measureDistance(missing,m),null,'Removed references are unavailable, never silently replaced')
assert.match(measurementCsv(missing),/Reference unavailable/)
for(const change of [d=>{d.measurements[0].from={kind:'banana'}},d=>{d.measurements[0].to={kind:'point',name:'bad',point:[NaN,0,0]}},d=>{d.measurements[0].axes={kind:'arm'}},d=>{d.measurements.push({...d.measurements[0]})}]){
 const bad=structuredClone(p);change(bad);assert.throws(()=>validateProject(bad))
}
const plane=measurementSliceProjection([0,0,5],[1,0,0],[.5,2,0],[100,100])
assert.deepEqual(plane.project([3,4,1000]),[102,102])
assert.equal(plane.distance([3,4,1000]),995,'Off-plane measurements remain projectable beyond native annotation tolerance')
assert.deepEqual(measurementSliceProjection([0,0,0],[-1,0,0],[0,0,2],[100,100]).project([5,8,6]),[95,103])
assert.equal(measurementSliceProjection([0,0,0],[1,0,0],[2,0,0],[0,0]),null)
console.log('Measurements: signed and rotated axes, distinct ear midpoint/frame zero, live object/tool references, stable arm IDs, unavailable references, archive/CSV/report, validation and Undo/Redo passed.')
