import assert from 'node:assert/strict'
import {NVImage,NVMesh} from '@niivue/niivue'
import {createAsset} from '../src/data/assets.ts'
import {createProject} from '@brainana/planning-core/model.ts'
import {nativeSurfaceSpacing} from '../src/render/volume.ts'
import {disposePreview} from '../src/render/disposePreview.ts'
globalThis.window={devicePixelRatio:1,addEventListener(){},location:{protocol:'http:'}}
const {NiiVuePlanningScene}=await import('../src/render/scene.ts')
const values=Float32Array.from({length:64},(_,i)=>i%3+1)
const data=NVImage.createNiftiArray([4,4,4],[1,2,3],[1,0,0,0,0,2,0,0,0,0,3,0,0,0,0,1],16,new Uint8Array(values.buffer))
const image=await NVImage.loadFromUrl({url:data,name:'volume.nii'})
const reorient=image.img2RAS;image.img2RAS=()=>{throw Error('Spacing must not copy voxel data')}
for(let i=0;i<20;i++)assert.equal(nativeSurfaceSpacing(image),1)
image.img2RAS=reorient
let cleanups=0,contexts=0
const preview={meshes:[{pts:new Float32Array(3000)}],volumes:[image],drawBitmap:new Uint8Array(50),cleanup(){cleanups++},gl:{getExtension(name){assert.equal(name,'WEBGL_lose_context');return {loseContext(){contexts++}}}}}
disposePreview(preview);disposePreview(preview);assert.equal(cleanups,1);assert.equal(contexts,1);assert.deepEqual(preview.meshes,[]);assert.deepEqual(preview.volumes,[]);assert.equal(preview.drawBitmap,null)
const unfinished={cleanup(){cleanups++},get gl(){throw Error('Canvas not attached')}}
assert.doesNotThrow(()=>disposePreview(unfinished));assert.equal(cleanups,2)
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const originalLoad=NVImage.loadFromFile,originalUpdate=NVMesh.prototype.updateMesh
const waiting=new Map()
NVImage.loadFromFile=async({file,name})=>waiting.has(name)?waiting.get(name).promise:NVImage.loadFromUrl({url:new Uint8Array(await file.arrayBuffer()),name})
NVMesh.prototype.updateMesh=()=>{}
const bundle=async name=>{const asset=await createAsset(name,'anatomy','frame',data);asset.modality='mri';return {project:createProject(asset,name,{kind:'standalone',subject:null,scan:null,sourceRoot:null}),bytes:new Map([[asset.id,data]])}}
const makeScene=()=>{
 const scene=new NiiVuePlanningScene({style:{}},{style:{}});scene.moveCrosshair=point=>{scene.crosshair=point};scene.setCutaway=()=>{}
 const gl=new Proxy({}, {get:(_,key)=>key==='createBuffer'||key==='createVertexArray'?()=>({}):()=>{}})
 for(const nv of [scene.slices,scene.render]){Object.defineProperty(nv,'gl',{value:gl});nv.drawScene=()=>{};nv.updateGLVolume=()=>{};nv.addVolume=v=>nv.volumes.push(v);nv.removeVolume=v=>nv.volumes=nv.volumes.filter(x=>x!==v);nv.addMesh=m=>nv.meshes.push(m);nv.removeMesh=m=>nv.meshes=nv.meshes.filter(x=>x!==m)}
 return scene
}
try{
 const scene=makeScene(),base=await bundle('base.nii');await scene.load(base)
 base.project.targets=[{id:'target',name:'Target',frameId:'frame',point:[1,1,1],color:'#ff7700',atlas:null}]
 scene.update(base.project,null);const mesh=scene.render.meshes[0];assert.ok(mesh)
 for(let i=0;i<5;i++){scene.setPlacementMap([],2);scene.update(base.project,null)}
 assert.equal(scene.render.meshes[0],mesh,'Clearing an already empty placement map must not rebuild all scene geometry')
 const cached=scene.imageForAsset(base.project.frame.referenceAssetId)
 const broken=deferred();waiting.set('broken.nii',broken)
 const failed=assert.rejects(scene.load(await bundle('broken.nii')),/Bad image/);broken.reject(Error('Bad image'));await failed
 assert.equal(scene.imageForAsset(base.project.frame.referenceAssetId),cached,'A failed reference import must keep the previous image caches')
 const old=deferred();waiting.set('slow.nii',old)
 const pending=scene.load(await bundle('slow.nii'));const rejected=assert.rejects(pending,{name:'AbortError'})
 scene.clear();old.resolve(image);await rejected
 assert.equal(scene.anatomy,null);assert.equal(scene.render.volumes.length,0,'A cleared workspace must not be resurrected by a late load')
 const older=deferred();waiting.set('older.nii',older)
 const a=scene.load(await bundle('older.nii'));const superseded=assert.rejects(a,{name:'AbortError'})
 await scene.load(await bundle('newest.nii'));older.resolve(image);await superseded
 assert.equal(scene.anatomy.image.name,'newest.nii','The most recently opened project must win')
 const atlasA=deferred();waiting.set('atlas-a.nii',atlasA)
 const slowAtlas=scene.setAtlas(data,'atlas-a.nii',[],'Older atlas')
 assert.equal(await scene.setAtlas(data,'atlas-b.nii',[],'Latest atlas'),true)
 atlasA.resolve(image);assert.equal(await slowAtlas,false);assert.equal(scene.atlasName,'Latest atlas')
 const atlasC=deferred();waiting.set('atlas-c.nii',atlasC)
 const clearing=scene.setAtlas(data,'atlas-c.nii',[],'Cancelled atlas');scene.clear();atlasC.resolve(image)
 assert.equal(await clearing,false);assert.equal(scene.atlas,null);assert.equal(scene.slices.volumes.length,0)
 console.log('Render lifecycle: spacing without pixel copies, preview GPU cleanup, empty-map reuse, failed import cache preservation, overlapping project/atlas loads and clear-during-load passed (GPU I/O mocked).')
}finally{NVImage.loadFromFile=originalLoad;NVMesh.prototype.updateMesh=originalUpdate}
