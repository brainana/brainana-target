import assert from 'node:assert/strict'
import {Worker} from 'node:worker_threads'
import {distanceTransform,cleanMask,mriSurface} from '../src/render/mriSurface.ts'
import {createProject} from '../../../packages/planning-core/model.ts'
import {validateProject} from '../../../packages/planning-core/validation.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
import {createAsset} from '../src/data/assets.ts'
// Exact distance transform must agree with brute force, including an empty feature set.
const dims=[7,6,5],mask=new Uint8Array(210);for(let i=0;i<mask.length;i++)mask[i]=Number(i%17===0||i===109)
for(const feature of [0,1]){const distance=distanceTransform(mask,dims,feature);for(let i=0;i<mask.length;i++){const p=[i%7,Math.floor(i/7)%6,Math.floor(i/42)];let best=Infinity;for(let j=0;j<mask.length;j++)if(mask[j]===feature){const q=[j%7,Math.floor(j/7)%6,Math.floor(j/42)];best=Math.min(best,p.reduce((n,v,k)=>n+(v-q[k])**2,0))}assert.equal(distance[i],best)}}
assert.ok(distanceTransform(new Uint8Array(8),[2,2,2],1).every(v=>v>1e10))
const hollow=new Uint8Array(125);for(let z=1;z<=3;z++)for(let y=1;y<=3;y++)for(let x=1;x<=3;x++)hollow[x+y*5+z*25]=1;hollow[62]=0;hollow[0]=1;cleanMask(hollow,[5,5,5],true,true);assert.equal(hollow[0],0);assert.equal(hollow[62],1)
const settings={sourceAssetId:'mri',method:'brain-dilate',offsetMm:0,threshold:.5,spacingMm:.5,largest:true,fillHoles:true,smooth:false,bounds:[[-8,-8,-8],[8,8,8]],edits:[]}
const volume={sample:p=>Number(Math.hypot(...p)<=4)}
const extent=mesh=>{const hi=[-Infinity,-Infinity,-Infinity],lo=[Infinity,Infinity,Infinity];for(const i of mesh.tris)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],mesh.pts[i*3+k]);hi[k]=Math.max(hi[k],mesh.pts[i*3+k])}return [lo,hi]}
const original=mriSurface(volume,settings),expanded=mriSurface(volume,{...settings,offsetMm:2}),eroded=mriSurface(volume,{...settings,method:'head-erode',offsetMm:1})
for(let k=0;k<3;k++){assert.ok(extent(expanded)[1][k]-extent(original)[1][k]>=1.5,'2 mm expansion measured in physical mm');assert.ok(extent(original)[1][k]-extent(eroded)[1][k]>=.5)}
assert.throws(()=>mriSurface(volume,{...settings,method:'head-erode',offsetMm:10}),/No surface remains/)
assert.throws(()=>mriSurface({sample:()=>0},settings),/empty/)
assert.throws(()=>mriSurface(volume,{...settings,spacingMm:.01}),/Invalid/)
assert.throws(()=>mriSurface(volume,{...settings,bounds:[[-100,-100,-100],[100,100,100]],spacingMm:.1}),/24 million/)
const cropped=mriSurface({sample:p=>Number(p[0]<0)},settings);assert.ok(cropped.report.croppedFaces>0);assert.ok(cropped.tris.length)
assert.equal(volume.sample([0,0,0]),1,'Source mask is not modified')
// Run the actual browser worker with a non-unit physical affine and compare pure computation.
const values=new Uint8Array(20**3);for(let z=0;z<20;z++)for(let y=0;y<20;y++)for(let x=0;x<20;x++)values[x+y*20+z*400]=Number(Math.hypot(x-10,y-10,z-10)<=6)
const matrix=[2,0,0,0,0,2,0,0,0,0,2,0,10,10,10,1],workerSettings={...settings,bounds:[[-5,-5,-5],[5,5,5]],offsetMm:1}
const sample=p=>{const v=p.map(x=>Math.round(x*2+10));return v.some(x=>x<0||x>=20)?NaN:values[v[0]+v[1]*20+v[2]*400]}
const expected=mriSurface({sample},workerSettings)
const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};import(workerData.url).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true,workerData:{url:new URL('../src/render/mriSurfaceWorker.ts',import.meta.url).href}})
let ticks=0;const timer=setInterval(()=>ticks++,1)
const result=await new Promise((resolve,reject)=>{worker.on('message',resolve);worker.on('error',reject);worker.postMessage({source:{dims:[20,20,20],values,matrix,slope:1,intercept:0},settings:workerSettings})});clearInterval(timer);await worker.terminate();assert.ok(!result.error,result.error);assert.deepEqual(result.result.pts,expected.pts);assert.deepEqual(result.result.tris,expected.tris);assert.ok(ticks>0)
const mri=await createAsset('MRI.nii','anatomy','frame',new Uint8Array([1,2])),input=await createAsset('mask.nii','mask','frame',new Uint8Array([3,4])),surface=await createAsset('MRI-estimate.stl','surface','frame',new Uint8Array([5,6]));surface.surfaceKind='skull';surface.mriSurface={...settings,sourceAssetId:mri.id,maskAssetId:input.id};const p=createProject(mri,'MRI estimate',{kind:'standalone',subject:null,scan:null,sourceRoot:null});p.assets.push(input,surface);p.planningSurfaceIds=[surface.id];validateProject(p)
const bytes=new Map([[mri.id,new Uint8Array([1,2])],[input.id,new Uint8Array([3,4])],[surface.id,new Uint8Array([5,6])]]),restored=await unpackProject(await packProject(p,bytes));assert.deepEqual(restored.project,p);assert.deepEqual(restored.bytes.get(input.id),bytes.get(input.id))
assert.throws(()=>validateProject({...p,assets:p.assets.filter(a=>a.id!==input.id)}),/missing MRI input mask/)
console.log('MRI masks: exact distances, physical dilation/erosion, cleanup, crop-face exclusion, affine worker geometry, responsiveness, empty/budget errors, recipe and source-mask persistence passed.')
