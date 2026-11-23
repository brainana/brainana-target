import assert from 'node:assert/strict'
import {createProject} from '@brainana/planning-core/model.ts'
import {axes,dot,cross,localToWorld} from '@brainana/planning-core/geometry.ts'
import {rigidFit,transformPoint,inversePoint,framePose,calculateAlignment,applyAlignment,alignmentStatus,calibrationResiduals,frameReadings,defaultCalibration} from '@brainana/planning-core/calibration.ts'
import {calibrateTool,calibratedTool,toolStatus} from '@brainana/planning-core/armCalibration.ts'
import {customFrameFields,frameDimensions} from '@brainana/planning-core/stereotax.ts'
import {createStereotax,armKinematics} from '@brainana/planning-core/stereotaxSetup.ts'
import {resolvePoint} from '@brainana/planning-core/measurements.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {createAsset} from '../src/data/assets.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
import {calibrationRows,calibrationCsv} from '../src/data/calibrationExport.ts'
import {coordinateRows,planReport} from '../src/data/export.ts'
import {ProjectStore} from '../src/state/store.ts'
import {unzipSync,strFromU8} from 'fflate'
const close=(a,b,tol=1e-8)=>{assert.equal(a.length,b.length);a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<tol,`${a} != ${b}`))}
const points=[[0,0,0],[10,0,0],[0,8,0],[0,0,7],[-5,9,6],[12,4,-8]]
for(const angles of [[0,0,0],[0,0,90],[180,0,0],[0,180,0],[0,0,180],[23,-49,67],[0,90,0],[40,-90,12],...Array.from({length:30},(_,i)=>[i*7-100,i*5-89,i*13-170])]){
 const pose={origin:[100,-25,34],angles},target=points.map(p=>localToWorld(pose,p)),fit=rigidFit(points,target)
 for(let i=0;i<points.length;i++){close(transformPoint(fit,points[i]),target[i]);close(inversePoint(fit,target[i]),points[i]);close(localToWorld(framePose(fit),target[i]),points[i])}
 assert.ok(Math.abs(dot(cross(fit.rotation[0],fit.rotation[1]),fit.rotation[2])-1)<1e-10)
 const reordered=rigidFit([...points].reverse(),[...target].reverse());close(reordered.translation,fit.translation)
}
// Overdetermined noisy fitting reduces squared error without changing scale.
const noisePose={origin:[15,-8,22],angles:[23,-17,61]},clean=points.map(p=>localToWorld(noisePose,p)),noisy=clean.map((p,i)=>p.map((n,j)=>n+.02*Math.sin(i*3+j)))
const noisyFit=rigidFit(points,noisy),squared=fit=>points.reduce((sum,p,i)=>sum+transformPoint(fit,p).reduce((n,v,j)=>n+(v-noisy[i][j])**2,0),0)
const cleanBasis=axes(noisePose),cleanTransform={rotation:[0,1,2].map(i=>cleanBasis.map(v=>v[i])),translation:noisePose.origin}
assert.ok(squared(noisyFit)<=squared(cleanTransform)+1e-10)
for(const point of points)close(transformPoint(noisyFit,point),localToWorld(noisePose,point),.05)
const planar=points.slice(0,3);const planeFit=rigidFit(planar,planar.map(p=>[p[0]+4,p[1]-2,p[2]+9]));close(planeFit.translation,[4,-2,9])
for(const [a,b] of [[points.slice(0,2),points.slice(0,2)],[[[0,0,0],[1,1,1],[2,2,2]],planar],[planar,[[0,0,0],[0,0,0],[0,0,0]]],[planar,[[NaN,0,0],[1,0,0],[0,1,0]]]])assert.throws(()=>rigidFit(a,b))
const reflected=rigidFit(points,points.map(p=>[-p[0],p[1],p[2]]));assert.ok(dot(cross(reflected.rotation[0],reflected.rotation[1]),reflected.rotation[2])>.99999)
assert.ok(points.some(p=>Math.hypot(...transformPoint(reflected,p).map((n,i)=>n-(i===0?-p[i]:p[i])))>1),'Reflections must not silently match')
const values=new Uint8Array([1,2,3]),asset=await createAsset('reference.nii','anatomy','frame',values),p=createProject(asset,'Calibration',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
p.stereotax=createStereotax('rat',[1,2,3]);p.frameCalibration=defaultCalibration();p.frameCalibration.directions=[-1,1,-1]
p.targets=[{id:'target',name:'Target',frameId:'frame',point:[2,3,4],color:'#ff0000',atlas:null}]
p.landmarks=points.map((point,i)=>({id:'f'+i,name:'Fiducial '+i,frameId:'frame',point}))
const expected={rotation:[[0,-1,0],[1,0,0],[0,0,1]],translation:[10,20,30]}
p.frameCalibration.pairs=p.landmarks.map((v,i)=>({id:'pair'+i,name:v.name,image:{kind:'landmark',id:v.id},framePoint:frameReadings(expected,v.point,p.frameCalibration.directions),role:i===5?'check':'fit',enabled:true}))
p.frameCalibration.pairs[5].framePoint[2]+=2
const candidate=calculateAlignment(p);assert.equal(alignmentStatus(p),'missing');applyAlignment(p,candidate);assert.equal(alignmentStatus(p),'current')
close(p.frameCalibration.result.translation,expected.translation)
for(let i=0;i<3;i++)close(p.frameCalibration.result.rotation[i],expected.rotation[i])
const residuals=calibrationResiduals(p);residuals.slice(0,5).forEach(v=>assert.ok(v.errorMm<1e-8));assert.ok(Math.abs(residuals[5].errorMm-2)<1e-8)
// Check points can change without secretly influencing the fitted transform.
p.frameCalibration.pairs[5].framePoint[0]+=10;assert.equal(alignmentStatus(p),'current')
p.landmarks[0].name='Renamed';assert.equal(alignmentStatus(p),'current')
const good=structuredClone(p)
for(const change of [q=>q.landmarks[0].point[0]++,q=>q.frameCalibration.pairs[0].framePoint[0]++,q=>q.frameCalibration.directions[0]*=-1,q=>q.stereotax.pose.origin[0]++,q=>q.assets[0].sha256='a'.repeat(64),q=>q.stereotax.earTipSpacingMm++,q=>q.display.setupOffsetMm=[1,0,0],q=>q.landmarks.shift()]){
 const changed=structuredClone(good);change(changed);assert.equal(alignmentStatus(changed),'changed')
}
p.stereotax.arms[0].stageZmm=1;assert.equal(alignmentStatus(p),'current','Arm slide motion must not invalidate fiducial alignment')
const pending=calculateAlignment(p),changed=structuredClone(p);changed.stereotax.pose.origin[0]++;assert.throws(()=>applyAlignment(changed,pending));assert.deepEqual(changed.stereotax.pose.origin,[p.stereotax.pose.origin[0]+1,...p.stereotax.pose.origin.slice(1)])
const noRig=structuredClone(p);delete noRig.stereotax;applyAlignment(noRig,calculateAlignment(noRig));assert.equal(alignmentStatus(noRig),'current','MRI-only evaluation does not require a frame model')
const rig=p.stereotax,arm=rig.arms[0],before=structuredClone(arm),holder=armKinematics(rig,arm).worldTip
calibrateTool(rig,arm,{name:'Probe',tipOffsetMm:[1,2,-15],zeroReadingsMm:[10,20,30],directions:[1,-1,-1]});assert.equal(toolStatus(rig,arm),'current')
const tool=calibratedTool(rig,arm);close(tool.readings,[10,20,30]);assert.notDeepEqual(tool.point,holder);assert.deepEqual(resolvePoint(p,{kind:'tool-tip',id:arm.id}).point,tool.point)
assert.deepEqual({...arm,toolCalibration:undefined},{...before,toolCalibration:undefined},'Setting a slide zero must not move the arm')
arm.stageZmm=4;arm.stageXmm=2;close(calibratedTool(rig,arm).readings,[12,20,27]);assert.equal(toolStatus(rig,arm),'current')
const tilted=structuredClone(rig);tilted.arms[0].toolTiltXDeg=12;assert.equal(toolStatus(tilted,tilted.arms[0]),'changed');assert.equal(calibratedTool(tilted,tilted.arms[0]),null)
const normalized=structuredClone(p);normalized.stereotax.dimensions=Object.fromEntries(customFrameFields.map(([,key])=>[key,frameDimensions(normalized.stereotax)[key]]));normalized.stereotax.railLateralMm=0;normalized.stereotax.earBlockOffsets={left:{apMm:0,heightMm:0},right:{apMm:0,heightMm:0}}
assert.equal(alignmentStatus(normalized),'current','Explicitly storing unchanged default geometry must not invalidate frame alignment')
assert.equal(toolStatus(normalized.stereotax,normalized.stereotax.arms[0]),'current','Explicit defaults must not invalidate tool calibration')
validateProject(p)
const bytes=await packProject(p,new Map([[asset.id,values]])),archive=unzipSync(bytes),reloaded=(await unpackProject(bytes)).project
assert.deepEqual(reloaded.frameCalibration,p.frameCalibration);assert.deepEqual(reloaded.stereotax.arms[0].toolCalibration,arm.toolCalibration);assert.equal(alignmentStatus(reloaded),'current')
assert.match(strFromU8(archive['calibration.csv']),/Independent|check/);assert.match(strFromU8(archive['dimensions-and-coordinates.json']),/frameCalibration/)
assert.ok(calibrationRows(p).every(row=>row.length===calibrationRows(p)[0].length));assert.ok(coordinateRows(p).every(row=>row.length===coordinateRows(p)[0].length));assert.match(planReport(p,null),/Frame alignment and tool calibration/)
const stale=structuredClone(p);stale.stereotax.pose.origin[0]++;const staleRows=calibrationRows(stale);assert.ok(staleRows.slice(1).every(row=>row.slice(10,14).every(v=>v==='')),'Stale calibrated coordinates and mismatches must not be exported as current');assert.match(calibrationCsv(stale),/changed/)
const store=new ProjectStore();store.replace(p);store.edit(q=>{q.landmarks[0].point[0]++});assert.equal(alignmentStatus(store.project),'changed');store.undo();assert.equal(alignmentStatus(store.project),'current');store.redo();assert.equal(alignmentStatus(store.project),'changed')
for(const change of [q=>q.frameCalibration.directions[0]=0,q=>q.frameCalibration.pairs[0].framePoint[0]=NaN,q=>q.frameCalibration.pairs[0].image={kind:'frame-zero'},q=>q.frameCalibration.result.rotation[0][0]=2,q=>q.frameCalibration.result.rotation[0]=q.frameCalibration.result.rotation[0].map(n=>-n),q=>q.stereotax.arms[0].toolCalibration.zeroStageMm=[0,Infinity,0]]){
 const bad=structuredClone(p);change(bad);assert.throws(()=>validateProject(bad))
}
console.log('Calibration: known rotations including 180° and gimbal lock, rigid/no-reflection invariants, degeneracy rejection, independent checks, stale detection, tool offsets/zeros, full-precision portable/CSV/report, validation and Undo/Redo passed.')
