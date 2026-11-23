import assert from 'node:assert/strict'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {targetRegionApproach,inTargetRegion} from '@brainana/planning-core/target-region.ts'
import {voxelRayDepth} from '@brainana/planning-core/target-voxel-index.ts'
import {assessHole} from '@brainana/planning-core/grid-assessment.ts'
import {seatedGridHeight,trajectory} from '@brainana/planning-core/geometry.ts'
import {searchTarget,applyCandidate} from '@brainana/planning-core/optimization.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {fitTarget} from '@brainana/planning-core/targeting.ts'
import {createAsset} from '../src/data/assets.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
import {geometryBundle} from '../src/data/geometryExport.ts'
import {rasterTargetRegion,targetRegionMesh} from '../src/render/targetRegion.ts'
import {unzipSync,strFromU8} from 'fflate'
const bytes=new Uint8Array([1,2,3]),asset=await createAsset('MRI','anatomy','f',bytes),p=createProject(asset,'ROI',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,10]);const c=p.chambers[0],g=p.grids[0],e=p.electrodes[0];c.height=10;c.innerRadius=5;g.count=1;e.length=100;p.planning={mode:'existing',seed:null,searchRadius:5,searchStep:2,maxMiss:.1,margin:0};const t={id:'t',name:'ROI',point:[.9,0,0],frameId:p.frame.id,color:'#ff6c32',displayRadiusMm:20,atlas:null};p.targets=[t];e.targetId=t.id
assert.ok(targetRegionApproach(c,g,[0,0],t,e).miss>.1,'Display radius does not change point targeting')
t.region={kind:'sphere',radiusMm:1};assert.equal(targetRegionApproach(c,g,[0,0],t,e).miss,0);let result=searchTarget(p,e.id,t.id);assert.ok(result.candidates.length);applyCandidate(p,e.id,t.id,result.candidates[0]);assert.ok(inTargetRegion(t,trajectory(c,g,e).tip));fitTarget(p,e.id,t.id)
t.region.radiusMm=.1;assert.equal(searchTarget(p,e.id,t.id).candidates.length,0);p.planning.maxMiss=10;assert.equal(searchTarget(p,e.id,t.id).candidates.length,0,'Point tolerance cannot expand a region')
t.point=[0,0,0];t.region={kind:'voxels',centers:[[0,0,5],[0,0,-5]],axes:[[1,0,0],[0,1,0],[0,0,1]]};const a=targetRegionApproach(c,g,[0,0],t,e);assert.equal(a.miss,0);assert.ok(inTargetRegion(t,trajectory(c,g,{...e,depth:a.depth}).tip));assert.equal(inTargetRegion(t,[0,0,0]),false,'Empty space between disjoint voxels is not filled');result=searchTarget(p,e.id,t.id);applyCandidate(p,e.id,t.id,result.candidates[0]);assert.ok(inTargetRegion(t,trajectory(c,g,e).tip),'Solver accepts a real voxel, not the ROI centroid gap')
const oblique={kind:'voxels',centers:[[1,2,3]],axes:[[2,0,0],[.5,1,0],[0,0,1.5]]};assert.equal(inTargetRegion({...t,region:oblique},[1.2,2.4,3.6]),true);assert.equal(inTargetRegion({...t,region:oblique},[1,2,4]),false)
assert.ok(voxelRayDepth(oblique,[1,2,10],[0,0,-1],0,100,7)!==null);assert.equal(voxelRayDepth(oblique,[10,2,10],[0,0,-1],0,100,7),null)
const plane={center:[1,2,3],right:[1,0,0],up:[0,1,0],widthMm:10,heightMm:10},image=new Uint8ClampedArray(100*100*4);rasterTargetRegion(image,100,100,plane,{...t,region:oblique});assert.ok(image[(50*100+50)*4+3]>0);assert.equal(image[(50*100+80)*4+3],0)
const adjacent={...t,region:{kind:'voxels',centers:[[0,0,0],[1,0,0]],axes:[[1,0,0],[0,1,0],[0,0,1]]}};assert.equal(targetRegionMesh(adjacent).tris.length/3,20,'Shared interior voxel face is omitted')
t.region=oblique;validateProject(p);const restored=(await unpackProject(await packProject(p,new Map([[asset.id,bytes]])))).project;assert.deepEqual(restored.targets[0].region,oblique);assert.equal(restored.schemaVersion,2,'ROI projects require a reader that supports actual target-region constraints');const output=unzipSync(geometryBundle(p,[]));assert.ok(output['valid-target-region-t.stl']);assert.ok(strFromU8(output['coordinates.csv']).includes('valid_target_voxel_center'))
assert.throws(()=>validateProject({...p,targets:[{...t,region:{kind:'sphere',radiusMm:0}}]}),/range|finite|number|Invalid/);assert.throws(()=>validateProject({...p,targets:[{...t,region:{kind:'voxels',centers:[],axes:oblique.axes}}]}),/voxels/)
const large={kind:'voxels',axes:[[1,0,0],[0,1,0],[0,0,1]],centers:Array.from({length:10000},(_,i)=>[i%100,Math.floor(i/100),0])},began=performance.now();for(let i=0;i<1000;i++)assert.ok(voxelRayDepth(large,[i%100,Math.floor(i/100),50],[0,0,-1],0,100,50)!==null);const elapsed=performance.now()-began;assert.ok(elapsed<5000,`Indexed 10k-voxel ROI took ${elapsed}ms`)
g.count=9;g.minimumThickness=2;g.tiltAngle=25;g.seatHeight=seatedGridHeight(c,g);delete t.region;t.point=[0,0,-10];p.planning.maxMiss=.1;const values=Array.from({length:9},(_,i)=>assessHole(p,c,g,e,[i-4,0]));assert.ok(values.some(v=>!v.wallClear));assert.ok(values.some(v=>v.wallClear))
console.log(`Point/display separation, spherical and sparse oblique voxel targeting, solver/apply/fit, exact raster, exterior voxel mesh, persistence/export and wall status passed. 1,000 rays against 10,000 valid voxels: ${elapsed.toFixed(1)} ms.`)

const {anchoredSliceZoom}=await import('../src/render/camera.ts')
const pan=[10,-20,5,2],crosshair=[14,-7,30],zoomed=anchoredSliceZoom(pan,crosshair,1.25)
for(let k=0;k<3;k++)assert.ok(Math.abs(crosshair[k]*pan[3]+pan[k]-(crosshair[k]*zoomed[3]+zoomed[k]))<1e-10,'Zoom retains crosshair screen position after panning')
assert.deepEqual(anchoredSliceZoom(zoomed,crosshair,null),[0,0,0,1])
const {ProjectStore}=await import('../src/state/store.ts')
const store=new ProjectStore();store.replace({...p,targets:[{...t,region:large}]});const shared=store.project.targets[0].region,beganEdits=performance.now();for(let i=0;i<20;i++)store.edit(d=>{d.name=`ROI display ${i}`},'display');assert.equal(store.project.targets[0].region,shared);assert.ok(Object.isFrozen(shared.centers[0]));console.log(`10,000-voxel target region shared across 20 metadata edits in ${(performance.now()-beganEdits).toFixed(1)} ms.`)
