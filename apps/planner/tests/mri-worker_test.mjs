import assert from 'node:assert/strict'
import {Worker as NodeWorker} from 'node:worker_threads'
globalThis.document={createElement:()=>({append(){},setAttribute(){}})}
const {buildMRISurface,disposeMRISurface}=await import('../src/render/mriSurfaceBuilder.ts')
const {activity}=await import('../src/ui/activity.ts')
const messages=[],workers=[]
class BrowserWorker{
 constructor(url){this.worker=new NodeWorker(`const {parentPort,workerData}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};import(workerData.url).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true,workerData:{url:url.href}});workers.push(this);this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({message:error.message}))}
 postMessage(data){messages.push(data);this.worker.postMessage(data)}
 terminate(){this.terminated=true;void this.worker.terminate()}
}
globalThis.Worker=BrowserWorker
const values=new Float32Array(20**3);for(let z=5;z<15;z++)for(let y=5;y<15;y++)for(let x=5;x<15;x++)values[x+y*20+z*400]=1
const volume={dims:[20,20,20],values,worldToVoxel:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],slope:1,intercept:0},settings={sourceAssetId:'m',method:'brain-dilate',offsetMm:0,threshold:.5,spacingMm:1,largest:true,fillHoles:true,smooth:false,bounds:[[0,0,0],[20,20,20]]}
try{
 const first=await buildMRISurface(volume,settings);assert.ok(first.tris.length)
 const second=await buildMRISurface(volume,{...settings,offsetMm:1});assert.ok(second.tris.length);assert.equal(workers.length,1);assert.ok(messages[0].source);assert.equal(messages[1].source,undefined,'Slider update reuses source volume in worker')
 await assert.rejects(buildMRISurface(volume,{...settings,threshold:2}),/empty/);assert.equal(activity.hidden,true)
 assert.ok((await buildMRISurface(volume,settings)).tris.length,'Worker recovers after bad threshold')
 const controller=new AbortController(),before=messages.length,pending=buildMRISurface(volume,settings,controller.signal);while(messages.length===before)await new Promise(resolve=>setTimeout(resolve,0));controller.abort();await assert.rejects(pending,/cancelled/);assert.equal(activity.hidden,true);assert.ok(workers[0].terminated)
 assert.ok((await buildMRISurface(volume,settings)).tris.length);assert.equal(workers.length,2,'Cancelled computation gets a fresh worker')
 disposeMRISurface(volume);assert.ok(workers[1].terminated,'Closing editor releases worker memory')
 const {buildCTSurface,disposeCTSurface}=await import('../src/render/ctSurfaceBuilder.ts')
 const start=messages.length,ctVolume={...volume}
 const ct=await buildCTSurface(ctVolume,.5,settings.bounds,{representation:'smooth',spacingMm:1,components:'largest'})
 assert.ok(ct.tris.length)
 const ct2=await buildCTSurface(ctVolume,.75,settings.bounds,{representation:'smooth',spacingMm:1,components:'largest'})
 assert.deepEqual(ct2.pts,ct.pts);assert.ok(messages[start].source);assert.equal(messages[start+1].source,undefined,'CT slider update also reuses source voxels')
 disposeCTSurface(ctVolume);assert.ok(workers.at(-1).terminated);assert.equal(activity.hidden,true)
 const {mriSurface}=await import('../src/render/mriSurface.ts')
 const make=(n,spacing,mask)=>{
  const values=new Float32Array(n**3),half=n/2
  for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){const r=Math.hypot((x-half)*spacing,(y-half)*spacing,(z-half)*spacing);values[x+y*n+z*n*n]=mask?Number(r<=8):r<=8?100:r<10?5:r<12?180:0}
  const matrix=[1/spacing,0,0,0,0,1/spacing,0,0,0,0,1/spacing,0,half,half,half,1]
  return {dims:[n,n,n],values,worldToVoxel:matrix,slope:1,intercept:0,sample:p=>{const v=p.map(x=>Math.round(x/spacing+half));return v.some(x=>x<0||x>=n)?NaN:values[v[0]+v[1]*n+v[2]*n*n]}}
 }
 const mri=make(64,.5,false),brain=make(32,1,true),bandSettings={...settings,method:'dark-band',bounds:[[-16,-16,-16],[16,16,16]],darkBand:{maximumIntensity:35,searchMm:12,minimumWidthMm:.5,maximumWidthMm:6,minimumScalpMm:1}},bandStart=messages.length
 const boundary=await buildMRISurface(mri,bandSettings,undefined,brain),expected=mriSurface(mri,bandSettings,brain)
 assert.deepEqual(boundary.pts,expected.pts);assert.deepEqual(boundary.tris,expected.tris);assert.ok(messages[bandStart].source);assert.ok(messages[bandStart].brain,'Worker receives independently aligned brain-mask source')
 for(let i=0;i<boundary.pts.length;i+=3)assert.ok(Math.abs(Math.hypot(...boundary.pts.subarray(i,i+3))-10)<1,'Paired affine sources select beneath scalp')
 const revised=await buildMRISurface(mri,{...bandSettings,darkBand:{...bandSettings.darkBand,maximumIntensity:40}},undefined,brain);assert.ok(revised.tris.length);assert.equal(messages[bandStart+1].source,undefined);assert.equal(messages[bandStart+1].brain,undefined,'Brightness adjustments reuse both cached volumes')
 const directSettings={...bandSettings,method:'dark-band-head',threshold:50}
 const direct=await buildMRISurface(mri,directSettings),directExpected=mriSurface(mri,directSettings)
 assert.deepEqual(direct.pts,directExpected.pts);assert.deepEqual(direct.tris,directExpected.tris)
 assert.ok(direct.boundary.file.length);assert.ok(direct.boundary.labels.some(Boolean),'The real worker transfers native-grid boundary voxels')
 const {boundaryVoxels}=await import('../src/render/boundaryVoxels.ts')
 const expectedLabels=boundaryVoxels(directExpected,{dims:mri.dims,matrix:mri.worldToVoxel})
 assert.deepEqual(direct.boundary.labels,expectedLabels.labels);assert.deepEqual(direct.boundary.file,expectedLabels.file)
 const sparse={...mri,values:mri.values.slice()},half=32
 for(let z=0;z<64;z++)for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(x>half&&Math.hypot(y-half,z-half)/Math.hypot(x-half,y-half,z-half)<.15&&Math.hypot(x-half,y-half,z-half)>16)sparse.values[x+y*64+z*4096]=0
 const completionSettings={...directSettings,darkBand:{...directSettings.darkBand,center:[0,0,0],completion:{enabled:true,maximumGapMm:8,smoothness:.5}}}
 const completed=await buildMRISurface(sparse,completionSettings)
 assert.ok(completed.reconstructedFaces?.some(Boolean));assert.ok(completed.boundary.labels.includes(2),'Reconstructed classification reaches voxel fill through the worker')
 assert.ok(mri.values.byteLength>0,'Source MRI pixels remain attached after result transfers');disposeMRISurface(sparse)
 const generated={...bandSettings,brainEstimate:{threshold:50,seed:[0,0,0]}}
 const seedBoundary=await buildMRISurface(mri,generated),seedExpected=mriSurface(mri,generated)
 assert.deepEqual(seedBoundary.pts,seedExpected.pts);assert.deepEqual(seedBoundary.tris,seedExpected.tris)
 const changed=await buildMRISurface(mri,{...generated,offsetMm:.5});assert.ok(changed.tris.length);assert.equal(messages.at(-1).source,undefined,'Derived-brain updates also reuse source voxels')
 disposeMRISurface(mri);assert.ok(workers.at(-1).terminated)
 console.log('MRI and CT worker source caching, async builds, error recovery, cancellation, activity cleanup and disposal passed.')
}finally{disposeMRISurface(volume);for(const worker of workers)worker.terminate()}
