import assert from 'node:assert/strict'
import { NVImage } from '@niivue/niivue'
import { VolumeSampler } from '../src/render/volume.ts'
import { skullPreview, imageBounds } from '../src/render/ctSkull.ts'
const dims = [10, 10, 10],
  data = new Float32Array(1000)
for (let z = 0; z < 10; z++)
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) if (x < 3 || x > 7) data[x + 10 * y + 100 * z] = 1000
const affine = [2, 0, 0, 10, 0, 2, 0, 20, 0, 0, 2, 30, 0, 0, 0, 1]
const image = await NVImage.loadFromUrl({
  url: NVImage.createNiftiArray(dims, [2, 2, 2], affine, 16, new Uint8Array(data.buffer)),
  name: 'ct.nii',
})
const volume = new VolumeSampler(image),
  bounds = imageBounds(volume),
  surface = skullPreview(volume, 300, bounds)
assert.deepEqual(bounds, [
  [10, 20, 30],
  [28, 38, 48],
])
assert.ok(surface.tris.length > 0)
const cropped = skullPreview(volume, 300, [
  [10, 20, 30],
  [16, 38, 48],
])
assert.ok(cropped.pts.every((v, i) => i % 3 !== 0 || v <= 16))
assert.throws(() => skullPreview(volume, 2000, bounds), /No CT voxels/)
assert.equal(image.img[0], 1000)
console.log('CT physical bounds, threshold, crop exclusion and immutable source passed.')
const objects={sample:([x,y,z])=>(x>=2&&x<5&&y>=2&&y<5&&z>=2&&z<5)||(x>=7&&x<9&&y>=7&&y<9&&z>=7&&z<9)?1000:0}
const crop=[[0,0,0],[10,10,10]]
const all=skullPreview(objects,300,crop,{spacingMm:1,components:'all'})
const largest=skullPreview(objects,300,crop,{spacingMm:1,components:'largest'})
assert.equal(all.report.components,2);assert.equal(all.report.retainedVoxels,35)
assert.equal(largest.report.retainedVoxels,27);assert.equal(largest.report.removedVoxels,8);assert.equal(largest.report.boundaryVoxels,0)
assert.ok(largest.pts.every(v=>v>=2&&v<=5),'Cleanup retains the actual largest object rather than its bounding box')
const boundary=skullPreview({sample:()=>1000},300,[[0,0,0],[3.1,4.1,5.1]],{spacingMm:2})
assert.ok(boundary.report.boundaryVoxels>0)
assert.ok(boundary.pts.every((v,i)=>v<=[3.1,4.1,5.1][i%3]+1e-6),'Partial cells cannot extend beyond the requested crop')
assert.throws(()=>skullPreview(objects,300,[[0,0,0],[1e10,1e10,1e10]],{spacingMm:.5}),/valid sampling grid/)
assert.throws(()=>skullPreview(objects,300,[[0,0,0],[0,10,10]]),/Invalid/)
const {inspectSurface}=await import('../src/render/surfaceInspection.ts')
assert.equal(inspectSurface(largest).valid,true)
assert.equal(inspectSurface({pts:[0,0,0,1,0,0,0,1,0],tris:[0,1,99]}).valid,false)
assert.equal(inspectSurface({pts:[0,0,0,NaN,0,0,0,1,0],tris:[0,1,2]}).valid,false)
assert.equal(inspectSurface({pts:[0,0,0,1,0,0,2,0,0],tris:[0,1,2]}).valid,false)
const {buildCTSurface,disposeCTSurface}=await import('../src/render/ctSurfaceBuilder.ts')
const asyncSurface=await buildCTSurface(volume,300,bounds,{spacingMm:1,components:'largest'})
assert.deepEqual(asyncSurface,skullPreview(volume,300,bounds,{spacingMm:1,components:'largest'}))
console.log('CT resolution, explicit component cleanup, crop contact, sampling-grid validation, structural mesh checks and async builder equivalence passed.')
// Execute the actual browser-worker module with worker_threads transport, not a mocked result.
const {Worker:NodeWorker}=await import('node:worker_threads')
class BrowserWorker {
 constructor(url){
  this.worker=new NodeWorker(`const {parentPort,workerData}=require('node:worker_threads');globalThis.self={postMessage:(data,options)=>parentPort.postMessage(data,options?.transfer)};import(workerData.url).then(()=>parentPort.on('message',data=>self.onmessage({data}))).catch(error=>{throw error});`,{eval:true,workerData:{url:url.href}})
  this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({message:error.message}))
 }
 postMessage(data){this.worker.postMessage(data)}
 terminate(){void this.worker.terminate()}
}
globalThis.Worker=BrowserWorker
let shellVolume
try {
 assert.deepEqual(await buildCTSurface(volume,300,bounds,{spacingMm:1,components:'largest'}),asyncSurface)
 const smoothOptions={spacingMm:1,components:'largest',representation:'smooth'}
 assert.deepEqual(await buildCTSurface(volume,300,bounds,smoothOptions),skullPreview(volume,300,bounds,smoothOptions))
 const shellValues=Float32Array.from({length:24**3},(_,i)=>{const r=Math.hypot((i%24)*.5-5.75,(Math.floor(i/24)%24)*.5-5.75,Math.floor(i/576)*.5-5.75);return r>=3&&r<=4?1000:0})
 const shellImage=await NVImage.loadFromUrl({url:NVImage.createNiftiArray([24,24,24],[.5,.5,.5],[.5,0,0,0,0,.5,0,0,0,0,.5,0,0,0,0,1],16,new Uint8Array(shellValues.buffer)),name:'outer-ct.nii'})
 shellVolume=new VolumeSampler(shellImage)
 const shellBounds=imageBounds(shellVolume,true),outerOptions={spacingMm:.5,components:'largest',representation:'outer',componentSeed:[9,5.75,5.75]}
 const expectedOuter=skullPreview(shellVolume,300,shellBounds,outerOptions)
 assert.deepEqual(await buildCTSurface(shellVolume,300,shellBounds,outerOptions),expectedOuter)
 assert.ok(expectedOuter.report.outer.coverage>.99)
 const fine=await buildCTSurface(shellVolume,300,shellBounds,{...outerOptions,spacingMm:.1})
 assert.equal(fine.report.spacingMm,.1)
 assert.ok(fine.tris.length>expectedOuter.tris.length,'0.1 mm builds a finer surface for a crop within the limits')
 const correctedOptions={...outerOptions,edits:[{mode:'erase',normal:2,thicknessMm:.5,radius:1,points:[[5.75,5.75,9.5]]}]},originalPixels=shellImage.img.slice()
 const corrected=await buildCTSurface(shellVolume,300,shellBounds,correctedOptions)
 assert.deepEqual(corrected,skullPreview(shellVolume,300,shellBounds,correctedOptions));assert.ok(corrected.report.retainedVoxels<expectedOuter.report.retainedVoxels);assert.deepEqual(shellImage.img,originalPixels)

 const isoOptions={spacingMm:1,components:'largest',representation:'isosurface'}
 assert.deepEqual(await buildCTSurface(volume,300,bounds,isoOptions),skullPreview(volume,300,bounds,isoOptions))
 const controller=new AbortController(),cancelled=buildCTSurface(volume,300,bounds,isoOptions,controller.signal);controller.abort();await assert.rejects(cancelled,error=>error.name==='AbortError')
 await assert.rejects(buildCTSurface(volume,2000,bounds,{spacingMm:1}),/No CT voxels/)
} finally {disposeCTSurface(volume);if(shellVolume)disposeCTSurface(shellVolume);delete globalThis.Worker}
console.log('Actual CT worker transport reproduces reference geometry and returns extraction errors.')

assert.deepEqual(imageBounds(volume,true),[[9,19,29],[29,39,49]])

const {ctDefaults}=await import('../src/render/ctDefaults.ts')
assert.deepEqual(ctDefaults({global_min:-1000,global_max:3000}),{lo:-1000,hi:3000,min:1000,max:3000})
const uniform=ctDefaults({global_min:10,global_max:10});assert.ok(uniform.min>10&&uniform.max>uniform.min)
assert.equal(ctDefaults({cal_min:-50,cal_max:150}).min,50)
console.log('CT default minimum uses the actual range midpoint, including signed and constant-intensity data.')

// Smoothing changes geometry, not connectivity, and cannot drift arbitrarily.
const analytic={sample:p=>Math.hypot(p[0]-5,p[1]-5,p[2]-5)<3.5?1000:0}
const iso=skullPreview(analytic,300,[[0,0,0],[10,10,10]],{spacingMm:.4,representation:'isosurface'})
const smooth=skullPreview(analytic,300,[[0,0,0],[10,10,10]],{spacingMm:.4,representation:'smooth'})
assert.deepEqual(smooth.tris,iso.tris)
assert.equal(inspectSurface(smooth).valid,true)
let moved=0
for(let i=0;i<iso.pts.length;i+=3){const d=Math.hypot(...[0,1,2].map(k=>smooth.pts[i+k]-iso.pts[i+k]));assert.ok(d<=.20001);if(d>1e-5)moved++}
assert.ok(moved>100)
const roughness=mesh=>{let sum=0;const neighbors=Array.from({length:mesh.pts.length/3},()=>new Set());for(let t=0;t<mesh.tris.length;t+=3){const a=mesh.tris[t],b=mesh.tris[t+1],c=mesh.tris[t+2];for(const [i,j,k] of [[a,b,c],[b,c,a],[c,a,b]]){neighbors[i].add(j);neighbors[i].add(k)}}for(let i=0;i<neighbors.length;i++){const ns=[...neighbors[i]];for(let k=0;k<3;k++){const d=mesh.pts[i*3+k]-ns.reduce((v,j)=>v+mesh.pts[j*3+k],0)/ns.length;sum+=d*d}}return sum}
assert.ok(roughness(smooth)<roughness(iso)*.8,'Smoothing should materially reduce voxel stair-stepping')
const {nativeSurfaceSpacing}=await import('../src/render/volume.ts')
assert.equal(nativeSurfaceSpacing(image),2)
console.log('Smoothed mesh preserves connectivity, limits geometric displacement, reduces stair-stepping, accepts native spacing, and matches actual worker output.')

// Exercise NiiVue's real framing calculation without a GPU context.
const {Niivue}=await import('@niivue/niivue')
const {lockPreviewFrame}=await import('../src/render/surfaceFrame.ts')
const framing={volumes:[],meshes:[],scene:{volScaleMultiplier:1.75},sceneExtentsMinMax:Niivue.prototype.sceneExtentsMinMax}
for(const size of [10,4,1]){
 const mesh={extentsMin:[-size,-size,-size],extentsMax:[size,size,size]}
 lockPreviewFrame(mesh,[[-20,-30,-40],[20,30,40]])
 framing.meshes=[mesh]
 Niivue.prototype.setPivot3D.call(framing)
 assert.deepEqual(Array.from(framing.pivot3D),[0,0,0])
 assert.deepEqual(Array.from(framing.extentsMax),[20,30,40])
 assert.equal(framing.scene.volScaleMultiplier,1.75)
}
console.log('Actual NiiVue framing stays at the reference bounds across threshold/crop sizes and preserves user zoom.')

// A cropped direct CT mesh must leave the cut plane open for placement.
{
 const shell = { sample: p => { const r = Math.hypot(...p); return r >= 4 && r <= 6 ? 1000 : 0 } }
 const crop = [[-8,-8,-8], [8,8,5]]
 for (const representation of ['isosurface', 'smooth']) {
  const mesh = skullPreview(shell, 300, crop, { spacingMm: .5, components: 'largest', representation })
  assert.ok(mesh.tris.length > 0)
  for (let i = 0; i < mesh.tris.length; i += 3)
   assert.ok(![0,1,2].some(k => [crop[0][k], crop[1][k]].some(edge =>
    [0,1,2].every(j => Math.abs(mesh.pts[mesh.tris[i+j]*3+k] - edge) < 1e-5))), 'The crop boundary must not become a flat mounting face')
  const used = new Set(mesh.tris)
  assert.equal(used.size, mesh.pts.length/3, 'Unused cap vertices must not become placement samples')
 }
}
console.log('Direct CT mesh retains both bone walls while omitting artificial crop faces and unused placement samples.')
