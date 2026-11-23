import assert from 'node:assert/strict'
import { NVImage, NVMesh } from '@niivue/niivue'
import { createAsset } from '../src/data/assets.ts'
import { createProject } from '@brainana/planning-core/model.ts'
globalThis.window={devicePixelRatio:1,addEventListener:()=>{},location:{protocol:'http:'}}
const {defaultSceneDisplay,layerOpacity}=await import('../src/render/display.ts')
const display={...defaultSceneDisplay(),chamberOpacity:1,implantOpacity:.4}
assert.equal(layerOpacity(display,'chambers',.65),1)
assert.equal(layerOpacity(display,'electrodes',.65),.4)
assert.equal(layerOpacity({...display,chamberOpacity:0},'electrodes',.65),.4)
const { NiiVuePlanningScene } = await import('../src/render/scene.ts')
// Exercise the actual renderer's scene/state transitions with GPU I/O replaced.
// These checks verify rendering decisions, not pixels or native graphics support.
const originalImage=NVImage.loadFromFile,originalMesh=NVMesh.loadFromFile
NVImage.loadFromFile=async({file,name})=>NVImage.loadFromUrl({url:new Uint8Array(await file.arrayBuffer()),name})
NVMesh.loadFromFile=async({name,opacity})=>({name,opacity,pts:new Float32Array([0,0,0,1,0,0,0,1,0]),tris:new Uint32Array([0,1,2]),unloadMesh:()=>{}})
try{
for(const [modality,kinds] of [['mri',['brain','skull']],['mri',['skull']],['ct',['brain']],['ct',['skull']]]){
 const data=NVImage.createNiftiArray([4,4,4],[1,1,1],undefined,16,new Uint8Array(Float32Array.from({length:64},(_,i)=>i).buffer))
 const reference=await createAsset('reference.nii','anatomy','frame',data);reference.modality=modality
 const p=createProject(reference,'test',{kind:'standalone',subject:null,scan:null,sourceRoot:null}),bytes=new Map([[reference.id,data]])
 for(const kind of kinds){const a=await createAsset(kind+'.gii','surface','frame',new Uint8Array([1]));a.surfaceKind=kind;p.assets.push(a);bytes.set(a.id,new Uint8Array([1]))}
 const scene=new NiiVuePlanningScene({},{});scene.moveCrosshair=point=>{scene.crosshair=point};scene.setCutaway=()=>{}
 for(const nv of [scene.slices,scene.render]){Object.defineProperty(nv,'gl',{value:{}});nv.drawScene=()=>{};nv.updateGLVolume=()=>{};nv.addVolume=v=>{nv.volumes.push(v)};nv.removeVolume=v=>{nv.volumes=nv.volumes.filter(x=>x!==v)};nv.addMesh=m=>{nv.meshes.push(m)};nv.removeMesh=m=>{nv.meshes=nv.meshes.filter(x=>x!==m)}}
 assert.equal(scene.render.opts.meshXRay,0)
 scene.set3DDisplay({showOccludedGeometry:true});assert.ok(scene.render.opts.meshXRay>0)
 scene.set3DDisplay({showOccludedGeometry:false});assert.equal(scene.render.opts.meshXRay,0)
 await scene.load({project:p,bytes});scene.set3DDisplay({anatomyOpacity:.2,skullOpacity:.7})
 for(const kind of kinds)assert.equal(scene.render.meshes.find(m=>m.name===kind+'.gii').opacity,kind==='brain'?.2:.7)
 assert.equal(scene.render.volumes[0].opacity,kinds.includes(modality==='ct'?'skull':'brain')?0:modality==='ct'?.7:.2)
 scene.set3DDisplay({skullOpacity:0});scene.set3DDisplay({skullOpacity:.8})
 if(kinds.includes('skull'))assert.equal(scene.render.meshes.find(m=>m.name==='skull.gii').opacity,.8)
 if(kinds.includes('brain'))assert.equal(scene.render.meshes.find(m=>m.name==='brain.gii').opacity,.2)
}
// MRI and CT remain independently rendered across underlay changes, and windows survive colormap setters/clones.
{
 const data=NVImage.createNiftiArray([4,4,4],[1,1,1],undefined,16,new Uint8Array(Float32Array.from({length:64},(_,i)=>i).buffer))
 const mri=await createAsset('mri.nii','anatomy','frame',data);mri.modality='mri'
 const ct=await createAsset('ct.nii','ct','frame',data);ct.modality='ct'
 const p=createProject(mri,'test',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
 p.assets.push(ct);const bytes=new Map([[mri.id,data],[ct.id,data]])
 const scene=new NiiVuePlanningScene({},{});scene.moveCrosshair=()=>{};scene.setCutaway=()=>{}
 for(const nv of [scene.slices,scene.render]){Object.defineProperty(nv,'gl',{value:{}});nv.drawScene=()=>{};nv.updateGLVolume=()=>{};nv.addVolume=v=>nv.volumes.push(v);nv.removeVolume=v=>nv.volumes=nv.volumes.filter(x=>x!==v);nv.addMesh=m=>nv.meshes.push(m);nv.removeMesh=m=>nv.meshes=nv.meshes.filter(x=>x!==m)}
 await scene.load({project:p,bytes})
 scene.set3DDisplay({anatomyOpacity:.25,skullOpacity:.65})
 const ids=scene.render.volumes.map(v=>v.id)
 for(const selected of [ct.id,mri.id,ct.id]){
  p.display.anatomyAssetId=selected;p.display.anatomyOverlayIds=[selected===ct.id?mri.id:ct.id]
  for(const a of p.assets)a.imageDisplay={min:11,max:29,opacity:.4,colormap:'gray',visible:true}
  await scene.syncImages({project:p,bytes})
  assert.deepEqual(scene.render.volumes.map(v=>v.id),ids,'Switching slice underlay must not replace 3D volumes')
  assert.deepEqual(scene.render.volumes.map(v=>v.opacity),[.25,.65])
  assert.equal(scene.slices.volumes[0],scene.imageForAsset(selected))
  assert.equal(scene.slices.volumes[1].opacity,.4,'Both MRI/CT blend in Anatomy')
  for(const nv of [scene.slices,scene.render])for(const image of nv.volumes){assert.equal(image.cal_min,11);assert.equal(image.cal_max,29)}
 }
 scene.set3DDisplay({skullOpacity:0});assert.equal(scene.render.volumes[1].opacity,0)
 scene.set3DDisplay({skullOpacity:.8});assert.equal(scene.render.volumes[1].opacity,.8);assert.equal(scene.render.volumes[0].opacity,.25)
}
// Exercise every ordering of common image controls with MRI-first and CT-first projects.
const permutations=xs=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(rest=>[x,...rest])):[[]]
let renderOrders=0
for(const first of ['mri','ct'])for(const order of permutations(['select','blend','window','opacity'])){
 const data=NVImage.createNiftiArray([4,4,4],[1,1,1],undefined,16,new Uint8Array(Float32Array.from({length:64},(_,i)=>i).buffer))
 const reference=await createAsset(first+'.nii','anatomy','frame',data);reference.modality=first
 const second=await createAsset('second.nii',first==='mri'?'ct':'overlay','frame',data);second.modality=first==='mri'?'ct':'mri'
 const p=createProject(reference,'test',{kind:'standalone',subject:null,scan:null,sourceRoot:null});p.assets.push(second)
 const bytes=new Map([[reference.id,data],[second.id,data]])
 const scene=new NiiVuePlanningScene({},{});scene.moveCrosshair=()=>{};scene.setCutaway=()=>{}
 for(const nv of [scene.slices,scene.render]){Object.defineProperty(nv,'gl',{value:{}});nv.drawScene=()=>{};nv.updateGLVolume=()=>{};nv.addVolume=v=>nv.volumes.push(v);nv.removeVolume=v=>nv.volumes=nv.volumes.filter(x=>x!==v);nv.addMesh=m=>nv.meshes.push(m);nv.removeMesh=m=>nv.meshes=nv.meshes.filter(x=>x!==m)}
 await scene.load({project:p,bytes});const ids=scene.render.volumes.map(v=>v.id)
 for(const action of order){
  if(action==='select'){
   const previous=p.display.anatomyAssetId??reference.id
   if(p.display.anatomyOverlayIds?.includes(second.id))p.display.anatomyOverlayIds=[previous]
   p.display.anatomyAssetId=second.id
  }
  if(action==='blend')p.display.anatomyOverlayIds=[p.display.anatomyAssetId===second.id?reference.id:second.id]
  if(action==='window')for(const a of p.assets)a.imageDisplay={min:11,max:29,opacity:.4,colormap:'bone',visible:true}
  if(action==='opacity')scene.set3DDisplay({anatomyOpacity:.25,skullOpacity:.65})
  await scene.syncImages({project:p,bytes});assert.deepEqual(scene.render.volumes.map(v=>v.id),ids)
 }
 assert.equal(scene.slices.volumes[1].opacity,.4)
 for(const nv of [scene.slices,scene.render])for(const image of nv.volumes){assert.equal(image.cal_min,11);assert.equal(image.cal_max,29);assert.equal(image.colormap,'bone')}
 assert.deepEqual(scene.render.volumes.map(v=>v.opacity),first==='mri'?[.25,.65]:[.65,.25])
 scene.clear();assert.equal(scene.render.volumes.length,0);assert.equal(scene.placementSurface,null)
 renderOrders++
}
console.log(`${renderOrders} MRI-first/CT-first orderings of underlay selection, blending, colormap/window and independent 3D opacity passed (GPU I/O mocked).`)
console.log('Independent brain/skull surface and MRI/CT fallback volume opacity, including zero/restore, passed (GPU I/O mocked).')
}finally{NVImage.loadFromFile=originalImage;NVMesh.loadFromFile=originalMesh}
